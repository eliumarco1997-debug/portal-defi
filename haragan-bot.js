import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const WSS_RPC_URL = process.env.WSS_RPC_URL || 'wss://arb-mainnet.g.alchemy.com/v2/znxN0ZZnPA2F1f62XbSwR';

const ENV_API_KEY = process.env.BITUNIX_API_KEY;
const ENV_API_SECRET = process.env.BITUNIX_API_SECRET;

app.use(cors());
app.use(express.json());

const STATE_FILE = './state.json';
let protectedPools = {};

function saveState() {
  try {
    const stateToSave = {};
    for (const pool in protectedPools) {
      const poolData = { ...protectedPools[pool] };
      delete poolData.contract;
      delete poolData.apiKey;
      delete poolData.apiSecret;
      stateToSave[pool] = poolData;
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
  } catch (e) {
    console.error("Error al guardar estado:", e.message);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      protectedPools = JSON.parse(data);
      console.log(`✅ Estado cargado: ${Object.keys(protectedPools).length} pools activos.`);
    }
  } catch (e) {
    console.error("Error al cargar estado:", e.message);
  }
}

loadState();

const POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
];

const ERC20_ABI = [
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// ─────────────────────────────────────────────
// BITUNIX API
// ─────────────────────────────────────────────

function generateBitunixSignature(apiKey, apiSecret, nonce, timestamp, queryParams, bodyString) {
  const digestInput = nonce + timestamp + apiKey + queryParams + bodyString;
  const digest = crypto.createHash('sha256').update(digestInput).digest('hex');
  return crypto.createHash('sha256').update(digest + apiSecret).digest('hex');
}

async function bitunixRequest(endpoint, method, apiKey, apiSecret, body = {}) {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyString = Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  const signature = generateBitunixSignature(apiKey, apiSecret, nonce, timestamp, '', bodyString);

  const response = await fetch(`https://fapi.bitunix.com${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      'timestamp': timestamp,
      'nonce': nonce,
      'sign': signature
    },
    body: method === 'POST' ? bodyString : undefined
  });

  const text = await response.text();
  return { status: response.status, body: text };
}

async function setLeverage(symbol, leverage, apiKey, apiSecret) {
  try {
    const res = await bitunixRequest(
      '/api/v1/futures/account/change_leverage', 'POST', apiKey, apiSecret,
      { symbol: symbol.toUpperCase(), marginCoin: 'USDT', leverage: Number(leverage) }
    );
    const parsed = JSON.parse(res.body);
    if (parsed.code === 0) {
      console.log(`✅ [Bitunix] Apalancamiento cambiado a ${leverage}x exitosamente.`);
      return true;
    } else {
      console.error(`❌ [Bitunix] Bitunix RECHAZÓ el cambio de apalancamiento a ${leverage}x. Razón: ${parsed.msg}`);
      return false;
    }
  } catch (err) {
    console.warn(`❌ [Bitunix] Error al configurar leverage: ${err.message}`);
    return false;
  }
}

// Abre SHORT LIMIT — protege contra slippage masivo
async function placeHedgeOrder(pool, triggerPrice) {
  const { hedgeSymbol, hedgeQty, hedgeLeverage, apiKey, apiSecret } = pool;
  const key = apiKey || ENV_API_KEY;
  const secret = apiSecret || ENV_API_SECRET;

  if (!key || !secret) {
    console.error("❌ Faltan credenciales de Bitunix para este pool.");
    return false;
  }

  const leverageOk = await setLeverage(hedgeSymbol, hedgeLeverage, key, secret);
  if (!leverageOk) {
    console.error(`❌ ABORTANDO orden: No se pudo confirmar el apalancamiento ${hedgeLeverage}x en Bitunix. Verifica que no tengas posiciones u órdenes abiertas en ${hedgeSymbol}.`);
    return false;
  }

  // Usar la cantidad enviada por el dashboard en lugar del valor fijo
  const qty = parseFloat(hedgeQty);

  // Guardamos la cantidad calculada para poder cerrarla después
  pool.lastOpenedQty = qty;

  const requestedType = pool.orderType || 'LIMIT';
  console.log(`[Bitunix] Apalancamiento: ${hedgeLeverage}x | Posición en tokens: ${qty}`);

  let success = false;

  if (requestedType.toUpperCase() === 'LIMIT') {
    const maxSlippagePct = pool.maxSlippagePct || 0.3; // 0.3% de slippage para respetar bandas de Bitunix
    const limitPrice = triggerPrice * (1 - (maxSlippagePct / 100));
    const limitPriceStr = limitPrice.toFixed(4); // Ajustar decimales según el par si es necesario

    console.log(`[Bitunix] Intentando abrir SHORT LIMIT: ${qty} tokens de ${hedgeSymbol} a ${limitPriceStr} (Slippage ${maxSlippagePct}%)`);

    const payload = {
      symbol: hedgeSymbol,
      side: 'SELL',
      orderType: 'LIMIT',
      price: limitPriceStr,
      qty: String(qty),
      tradeSide: 'OPEN',
      effect: 'GTC',
      reduceOnly: false
    };

    try {
      const res = await bitunixRequest('/api/v1/futures/trade/place_order', 'POST', key, secret, payload);
      const parsed = JSON.parse(res.body);
      if (res.status === 200 && parsed.code === 0) {
        console.log(`✅ [Bitunix] SHORT LIMIT enviado con éxito!`);
        success = true;
      } else {
        console.log(`⚠️ [Bitunix] Error al abrir SHORT LIMIT. HTTP ${res.status}: ${res.body}`);
        console.log(`⚠️ Ejecutando FALLBACK automático a orden MARKET...`);
      }
    } catch (err) {
      console.warn(`⚠️ [Bitunix] Error de red en SHORT LIMIT: ${err.message}. Ejecutando FALLBACK automático a MARKET...`);
    }
  }

  // Si no fue exitoso (o si solicitó MARKET de inicio), intentamos MARKET
  if (!success) {
    console.log(`[Bitunix] Abriendo SHORT MARKET: ${qty} tokens de ${hedgeSymbol}`);
    const payload = {
      symbol: hedgeSymbol,
      side: 'SELL',
      orderType: 'MARKET',
      qty: String(qty),
      tradeSide: 'OPEN',
      effect: 'GTC',
      reduceOnly: false
    };

    try {
      const res = await bitunixRequest('/api/v1/futures/trade/place_order', 'POST', key, secret, payload);
      const parsed = JSON.parse(res.body);
      if (res.status === 200 && parsed.code === 0) {
        console.log(`✅ [Bitunix] SHORT MARKET enviado con éxito!`);
        success = true;
      } else {
        console.error(`❌ [Bitunix] Error final al abrir SHORT MARKET. HTTP ${res.status}: ${res.body}`);
      }
    } catch (err) {
      console.error('❌ [Bitunix] Error de red en fallback MARKET:', err.message);
    }
  }

  return success;
}

// Cierra SHORT con BUY MARKET — el cierre siempre debe ejecutarse sin importar el precio
async function closeHedgeOrder(pool, triggerPrice) {
  const { hedgeSymbol, hedgeQty, hedgeLeverage, apiKey, apiSecret, lastOpenedQty } = pool;
  const key = apiKey || ENV_API_KEY;
  const secret = apiSecret || ENV_API_SECRET;

  if (!key || !secret) return false;

  // Usa la cantidad exacta que se abrió, o el hedgeQty original como fallback
  let qty = lastOpenedQty;
  if (!qty) {
    qty = parseFloat(hedgeQty);
  }

  console.log(`[Bitunix] Cerrando SHORT con BUY MARKET: ${qty} tokens de ${hedgeSymbol}`);

  const payload = {
    symbol: hedgeSymbol,
    side: 'BUY',
    orderType: 'MARKET',
    qty: String(qty),
    tradeSide: 'CLOSE',
    effect: 'GTC',
    reduceOnly: true
  };

  try {
    const res = await bitunixRequest('/api/v1/futures/trade/place_order', 'POST', key, secret, payload);
    if (res.status === 200 && res.body.includes('"code":0')) {
      console.log(`✅ [Bitunix] SHORT cerrado con MARKET!`);
      return true;
    } else {
      console.log(`❌ [Bitunix] Error al cerrar SHORT. HTTP ${res.status}: ${res.body}`);
      return false;
    }
  } catch (err) {
    console.error('❌ [Bitunix] Error de red al cerrar:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// WEBSOCKET & LÓGICA PRINCIPAL
// ─────────────────────────────────────────────

let wsProvider;
try {
  if (WSS_RPC_URL && !WSS_RPC_URL.includes("DEMO_KEY_PLEASE_REPLACE")) {
    wsProvider = new ethers.WebSocketProvider(WSS_RPC_URL);
    console.log("✅ Conectado al proveedor WSS.");
    restoreListeners();
  } else {
    console.warn("⚠️ WSS_RPC_URL no configurada.");
  }
} catch (error) {
  console.error("❌ Error al conectar WSS RPC:", error.message);
}

function restoreListeners() {
  if (!wsProvider) return;
  for (const poolAddress in protectedPools) {
    attachSwapListener(poolAddress);
    console.log(`🔄 Listener restaurado para pool ${poolAddress}`);
  }
}

function attachSwapListener(poolAddress) {
  const limits = protectedPools[poolAddress];
  if (!limits || limits.contract) return;
  limits.contract = new ethers.Contract(poolAddress, POOL_ABI, wsProvider);
  limits.contract.on("Swap", (sender, recipient, amount0, amount1, sqrtPriceX96) => {
    handleSwap(poolAddress, sqrtPriceX96);
  });
}

async function handleSwap(poolAddress, sqrtPriceX96) {
  const limits = protectedPools[poolAddress];
  if (!limits || limits.isProcessingHedge) return;
  limits.isProcessingHedge = true;

  try {
    // Calcular precio actual del pool
    const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
    let price1 = sqrtPrice ** 2 * (10 ** Number(limits.decimals0)) / (10 ** Number(limits.decimals1));
    let price2 = (1 / (sqrtPrice ** 2)) * (10 ** Number(limits.decimals1)) / (10 ** Number(limits.decimals0));

    let price = price1;
    if (limits.isReversed === undefined) {
      limits.isReversed = Math.abs(price2 - limits.lowerBound) < Math.abs(price1 - limits.lowerBound);
      saveState();
    }
    if (limits.isReversed) price = price2;

    const stopLossPct = parseFloat(limits.stopLossPct || 0.5); // % de recuperación para cerrar

    console.log(`[${new Date().toLocaleTimeString()}] 📊 ${limits.symbol0}/${limits.symbol1} | Precio: ${price.toFixed(4)} | Límite: ${limits.lowerBound} | SHORT activo: ${limits.isHedged}`);

    // ── CASO 1: PRECIO FUERA DE RANGO ABAJO → Abrir SHORT (si no hay uno abierto) ──
    if (price < limits.lowerBound && !limits.isHedged) {
      console.log(`🚨 ¡TRIGGER! Precio (${price.toFixed(4)}) cayó del límite (${limits.lowerBound}). Abriendo SHORT...`);
      const success = await placeHedgeOrder(limits, price);
      if (success) {
        limits.isHedged = true;
        limits.hedgeEntryPrice = price; // Guardamos precio de apertura del SHORT
        saveState();
        console.log(`📌 Precio de entrada del SHORT guardado: ${price.toFixed(4)}`);
        console.log(`📌 El SHORT se cerrará cuando el precio suba ${stopLossPct}% (≥ ${(price * (1 + stopLossPct / 100)).toFixed(4)})`);
      }

      // ── CASO 2: PRECIO SUBIÓ EL % DE STOP-LOSS O SUPERÓ LÍMITE SUPERIOR → Cerrar SHORT ──
    } else if (limits.isHedged && limits.hedgeEntryPrice) {
      const closeTarget = limits.hedgeEntryPrice * (1 + stopLossPct / 100);
      const isAboveTarget = price >= closeTarget;
      const isAboveUpper = price >= limits.upperBound;

      if (isAboveTarget || isAboveUpper) {
        if (isAboveUpper) {
          console.log(`⚠️ ¡ALERTA DE SEGURIDAD! El precio (${price.toFixed(4)}) superó el límite superior (${limits.upperBound}). Cerrando SHORT de emergencia para evitar pérdidas descompensadas...`);
        } else {
          console.log(`🟢 ¡RECUPERACIÓN! Precio (${price.toFixed(4)}) superó el objetivo (${closeTarget.toFixed(4)}). Cerrando SHORT...`);
        }
        const success = await closeHedgeOrder(limits, price);
        if (success) {
          limits.isHedged = false;
          limits.hedgeEntryPrice = null;
          saveState();
          console.log(`🔁 SHORT cerrado. El bot vuelve a modo GUARDIA. Esperando próxima caída...`);
        }
      }
    }
  } finally {
    limits.isProcessingHedge = false;
  }
}

// ─────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────

// POST /api/bot/protect — Activar guardia para un pool
app.post('/api/bot/protect', async (req, res) => {
  const {
    poolAddress, lowerBound, upperBound,
    hedgeQty, hedgeSymbol, hedgeLeverage, stopLossPct,
    bitunixApiKey, bitunixApiSecret,
    orderType
  } = req.body;

  if (!poolAddress || !lowerBound || !upperBound) {
    return res.status(400).json({ error: "Faltan parámetros: poolAddress, lowerBound, upperBound" });
  }

  if (!wsProvider) {
    return res.status(500).json({ error: "WSS_RPC_URL no configurada. Configura el .env con tu nodo Arbitrum WebSocket." });
  }

  try {
    if (protectedPools[poolAddress]) {
      Object.assign(protectedPools[poolAddress], {
        lowerBound, upperBound,
        ...(hedgeQty && { hedgeQty }),
        ...(hedgeSymbol && { hedgeSymbol }),
        ...(hedgeLeverage && { hedgeLeverage }),
        ...(stopLossPct && { stopLossPct }),
        ...(bitunixApiKey && { apiKey: bitunixApiKey }),
        ...(bitunixApiSecret && { apiSecret: bitunixApiSecret }),
        ...(req.body.maxSlippagePct && { maxSlippagePct: req.body.maxSlippagePct }),
        ...(orderType && { orderType }),
        isReversed: undefined
      });
      saveState();
      console.log(`🛡️ Pool ${poolAddress} actualizado.`);
      return res.json({ success: true, message: "Configuración actualizada", poolAddress });
    }

    console.log(`🔍 Analizando nuevo pool: ${poolAddress}`);
    // Usar HTTP Provider para leer datos estáticos y evitar bloqueos por WSS público
    const httpProvider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, httpProvider);
    const token0Address = await poolContract.token0();
    const token1Address = await poolContract.token1();
    const token0Contract = new ethers.Contract(token0Address, ERC20_ABI, httpProvider);
    const token1Contract = new ethers.Contract(token1Address, ERC20_ABI, httpProvider);
    const decimals0 = await token0Contract.decimals();
    const decimals1 = await token1Contract.decimals();
    const symbol0 = await token0Contract.symbol();
    const symbol1 = await token1Contract.symbol();

    console.log(`✅ Pool verificado: ${symbol0}/${symbol1}`);

    protectedPools[poolAddress] = {
      lowerBound,
      upperBound,
      hedgeQty: hedgeQty || '0.01',
      hedgeSymbol: hedgeSymbol || 'ETHUSDT',
      hedgeLeverage: hedgeLeverage || 10,
      stopLossPct: stopLossPct || 0.5,
      maxSlippagePct: req.body.maxSlippagePct || 1.0,
      apiKey: bitunixApiKey || null,
      apiSecret: bitunixApiSecret || null,
      orderType: orderType || 'LIMIT',
      isHedged: false,
      hedgeEntryPrice: null,
      isProcessingHedge: false,
      decimals0: Number(decimals0),
      decimals1: Number(decimals1),
      symbol0, symbol1
    };
    saveState();
    attachSwapListener(poolAddress);

    console.log(`🛡️ [El Haragán] Bot en GUARDIA para ${symbol0}/${symbol1}`);
    console.log(`   Límite inferior: ${lowerBound} | Stop-loss recovery: ${stopLossPct}%`);
    console.log(`   El SHORT se abrirá automáticamente cuando el precio caiga por debajo de ${lowerBound}`);

    // Evaluar precio inmediato y disparar el SHORT si está fuera de rango
    let hedgeOpened = false;
    let hedgeError = null;
    try {
      const slot0 = await poolContract.slot0();
      const sqrtPrice = Number(slot0.sqrtPriceX96) / (2 ** 96);
      let price = sqrtPrice ** 2 * (10 ** Number(decimals0)) / (10 ** Number(decimals1));
      if (price < 0.0001) {
        price = (1 / (sqrtPrice ** 2)) * (10 ** Number(decimals1)) / (10 ** Number(decimals0));
      }
      console.log(`📊 Precio actual: ${price.toFixed(4)} | Límite inferior: ${lowerBound}`);

      if (price < lowerBound) {
        console.log(`⚡ Precio por debajo del límite. Ejecutando SHORT INMEDIATO...`);
        const success = await placeHedgeOrder(protectedPools[poolAddress], price);
        if (success) {
          protectedPools[poolAddress].isHedged = true;
          protectedPools[poolAddress].hedgeEntryPrice = price;
          saveState();
          hedgeOpened = true;
          console.log(`📌 ¡SHORT abierto en Bitunix! Precio: ${price.toFixed(4)}`);
        } else {
          hedgeError = 'Bitunix rechazó la orden. Revisa tus claves API y que tengas saldo USDT en futuros.';
          console.error(`❌ Bitunix rechazó la orden SHORT.`);
        }
      } else {
        console.log(`✅ Precio dentro del rango. Bot vigilando... se abrirá SHORT si baja de ${lowerBound}`);
      }
    } catch (e) {
      hedgeError = e.message;
      console.log(`⚠️ No se pudo evaluar precio: ${e.message}`);
    }

    if (hedgeError) {
      // Limpiar el pool protegido si falló
      delete protectedPools[poolAddress];
      saveState();
      return res.status(500).json({ success: false, error: hedgeError });
    }

    const msg = hedgeOpened 
      ? `SHORT abierto exitosamente para ${symbol0}/${symbol1}` 
      : `Vigilancia activa para ${symbol0}/${symbol1}. SHORT se abrirá automáticamente al salir de rango.`;
    res.json({ success: true, hedgeOpened, message: msg, poolAddress });

  } catch (error) {
    console.error("❌ Error al proteger pool:", error.message);
    res.status(500).json({ error: "Error al conectar con el contrato", details: error.message });
  }
});

// POST /api/bot/unprotect — Desactivar guardia
app.post('/api/bot/unprotect', async (req, res) => {
  const { poolAddress } = req.body;
  if (!poolAddress) return res.status(400).json({ error: "Falta poolAddress" });

  if (protectedPools[poolAddress]) {
    const pool = protectedPools[poolAddress];
    if (pool.isHedged) {
      const closePriceRef = pool.hedgeEntryPrice || 0;
      console.log(`🔒 Cerrando SHORT activo antes de desactivar guardia... Precio de referencia: ${closePriceRef}`);
      await closeHedgeOrder(pool, closePriceRef);
    }
    if (pool.contract) {
      try { pool.contract.removeAllListeners(); } catch (e) { }
    }
    delete protectedPools[poolAddress];
    saveState();
    console.log(`🛑 Guardia desactivada para ${poolAddress}`);
    res.json({ success: true, message: "Guardia desactivada", poolAddress });
  } else {
    res.json({ success: true, message: "Pool no estaba protegido", poolAddress });
  }
});

// GET /api/bot/status — Estado del bot
app.get('/api/bot/status', (req, res) => {
  const activePools = Object.keys(protectedPools).map(address => ({
    address,
    symbol0: protectedPools[address].symbol0,
    symbol1: protectedPools[address].symbol1,
    lowerBound: protectedPools[address].lowerBound,
    upperBound: protectedPools[address].upperBound,
    isHedged: protectedPools[address].isHedged,
    hedgeEntryPrice: protectedPools[address].hedgeEntryPrice,
    hedgeSymbol: protectedPools[address].hedgeSymbol,
    hedgeQty: protectedPools[address].hedgeQty,
    stopLossPct: protectedPools[address].stopLossPct,
    hasApiKey: !!(protectedPools[address].apiKey || ENV_API_KEY)
  }));

  res.json({
    status: "running",
    connectedToWSS: !!wsProvider,
    activeProtections: activePools.length,
    pools: activePools
  });
});


app.use('/bitunix-api', (req, res) => {
  const targetPath = req.url;
  const options = {
    hostname: 'fapi.bitunix.com',
    path: targetPath,
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] || 'application/json',
      ...(req.headers['api-key'] && { 'api-key': req.headers['api-key'] }),
      ...(req.headers['sign'] && { 'sign': req.headers['sign'] }),
      ...(req.headers['timestamp'] && { 'timestamp': req.headers['timestamp'] }),
      ...(req.headers['nonce'] && { 'nonce': req.headers['nonce'] }),
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json'
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': proxyRes.headers['content-type'] || 'application/json'
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send(`Proxy Error: ${e.message}`);
  });

  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
});

app.use('/revert-api', (req, res) => {
  const targetPath = req.url;
  const options = {
    hostname: 'api.revert.finance',
    path: targetPath,
    method: req.method,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': proxyRes.headers['content-type'] || 'application/json'
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (e) => {
    res.status(500).send(`Proxy Error: ${e.message}`);
  });

  if (req.method === 'POST' || req.method === 'PUT') {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
});

// Serve the static frontend build
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure that we only serve static files in production or when dist/ exists
if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Wildcard route to handle React Router navigation
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(404).send('La interfaz visual no está construida. Ejecuta "npm run build" o revisa la carpeta dist.');
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`🛡️  Motor "El Haragán" iniciado en el puerto ${PORT}`);
  console.log(`=================================================`);
  console.log(`WSS conectado: ${!!wsProvider}`);
  console.log(`Pools activos: ${Object.keys(protectedPools).length}`);
  console.log(`\nFlujo activo:`);
  console.log(`  1. Precio cae del límite inferior → SHORT abierto automáticamente`);
  console.log(`  2. Precio sube el % de stop-loss  → SHORT cerrado automáticamente`);
  console.log(`  3. Ciclo se repite infinitamente hasta que pares la guardia`);
  console.log(`\nEsperando configuraciones del dashboard...`);
});
