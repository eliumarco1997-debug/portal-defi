import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

let supabase;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;


if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.error("❌ Error inicializando cliente de Supabase:", err.message);
  }
} else {
  console.warn("⚠️ Advertencia: Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. El bot no podrá autenticar usuarios.");
}

const app = express();

const PORT = process.env.PORT || 3002;
const WSS_RPC_URL = process.env.WSS_RPC_URL || 'wss://arb-mainnet.g.alchemy.com/v2/znxN0ZZnPA2F1f62XbSwR';

const ENV_API_KEY = process.env.BITUNIX_API_KEY;
const ENV_API_SECRET = process.env.BITUNIX_API_SECRET;


// CORS: solo permite peticiones desde la URL de producción o localhost en dev
const allowedOrigins = [
  'https://portal-defi-production.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3002'
];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (ej. el bot llamándose a sí mismo) o de origins permitidos
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Origen bloqueado: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());


// Middleware: Validar Supabase JWT (Bearer Token)
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta token de autorización' });
  }
  if (!supabase) {
    console.error("[AUTH] Error: Supabase client is not initialized because environment variables are missing.");
    return res.status(500).json({ error: 'El servidor de autenticación no está configurado.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.warn(`[AUTH] Token inválido enviado a ${req.path}`);
      return res.status(401).json({ error: 'Token de autenticación inválido' });
    }
    req.userId = user.id;
    next();
  } catch (err) {
    console.error('[AUTH] Error verificando JWT:', err.message);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
}

const STATE_FILE = process.env.STATE_FILE_PATH || './state.json';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function encrypt(text) {
  if (!text || !ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    console.error("Error encrypting:", e.message);
    return null;
  }
}

function decrypt(text) {
  if (!text || !text.includes(':') || !ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) return text;
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error("Error decrypting:", e.message);
    return null;
  }
}

let protectedPositions = {};
const activePoolContracts = {};

async function saveState() {
  try {
    const stateToSave = {};
    for (const key in protectedPositions) {
      const posData = { ...protectedPositions[key] };
      delete posData.contract;
      
      if (ENCRYPTION_KEY && ENCRYPTION_KEY.length === 32) {
        if (posData.apiKey) posData.apiKey = encrypt(posData.apiKey);
        if (posData.apiSecret) posData.apiSecret = encrypt(posData.apiSecret);
      } else {
        delete posData.apiKey;
        delete posData.apiSecret;
      }
      
      stateToSave[key] = posData;
    }
    
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      await fetch(`${UPSTASH_URL}/set/protectedPools`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
        body: JSON.stringify(stateToSave)
      });
    } else {
      fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
    }
  } catch (e) {
    console.error("Error al guardar estado:", e.message);
  }
}

async function loadState() {
  try {
    let rawData = null;
    
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      const res = await fetch(`${UPSTASH_URL}/get/protectedPools`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const json = await res.json();
      if (json.result) {
        rawData = typeof json.result === 'string' ? json.result : JSON.stringify(json.result);
      }
    } else if (fs.existsSync(STATE_FILE)) {
      rawData = fs.readFileSync(STATE_FILE, 'utf8');
    }

    if (rawData) {
      const parsed = JSON.parse(rawData);
      protectedPositions = {};
      
      for (const key in parsed) {
        const item = parsed[key];
        if (ENCRYPTION_KEY && ENCRYPTION_KEY.length === 32) {
          if (item.apiKey) {
            const dec = decrypt(item.apiKey);
            if (dec) item.apiKey = dec;
          }
          if (item.apiSecret) {
            const dec = decrypt(item.apiSecret);
            if (dec) item.apiSecret = dec;
          }
        } else {
          if (item.apiKey && item.apiKey.includes(':')) delete item.apiKey;
          if (item.apiSecret && item.apiSecret.includes(':')) delete item.apiSecret;
        }
        
        if (key.includes(':')) {
          const parts = key.split(':');
          item.userId = parts[0];
          item.positionId = parts[1];
        } else if (!item.positionId) {
          item.positionId = key;
        }
        
        protectedPositions[key] = item;
      }
      
      console.log(`✅ Estado cargado (${UPSTASH_URL ? 'Redis' : STATE_FILE}): ${Object.keys(protectedPositions).length} posiciones activas.`);
    }
  } catch (e) {
    console.error("Error al cargar estado:", e.message);
  }
}

await loadState();

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
    console.warn(`⚠️ No se pudo confirmar el apalancamiento ${hedgeLeverage}x en Bitunix (puede que ya tengas posición abierta). Continuando con el apalancamiento actual...`);
    // No abortamos — Bitunix usa el leverage ya configurado para el símbolo
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
  let wssUrl = WSS_RPC_URL;
  if (wssUrl && wssUrl.startsWith('https://')) {
    wssUrl = wssUrl.replace('https://', 'wss://');
  } else if (wssUrl && wssUrl.startsWith('http://')) {
    wssUrl = wssUrl.replace('http://', 'ws://');
  }

  if (wssUrl && !wssUrl.includes("DEMO_KEY_PLEASE_REPLACE")) {
    console.log(`📡 Conectando a WebSocket RPC: ${wssUrl.substring(0, 45)}...`);
    wsProvider = new ethers.WebSocketProvider(wssUrl);
    console.log("✅ Conectado al proveedor WSS.");
    restoreListeners();
  } else {
    console.warn("⚠️ WSS_RPC_URL no configurada o demo detectada.");
  }
} catch (error) {
  console.error("❌ Error al conectar WSS RPC:", error.message);
}


function restoreListeners() {
  if (!wsProvider) return;
  const uniquePoolAddresses = [...new Set(Object.values(protectedPositions).map(pos => pos.poolAddress))];
  for (const poolAddress of uniquePoolAddresses) {
    if (poolAddress) {
      attachSwapListener(poolAddress);
      console.log(`🔄 Listener restaurado para pool ${poolAddress}`);
    }
  }
}

function attachSwapListener(poolAddress) {
  if (!poolAddress || !wsProvider) return;
  const addrLower = poolAddress.toLowerCase();
  if (activePoolContracts[addrLower]) return; // ya está escuchando
  
  try {
    const contract = new ethers.Contract(poolAddress, POOL_ABI, wsProvider);
    activePoolContracts[addrLower] = contract;
    contract.on("Swap", (sender, recipient, amount0, amount1, sqrtPriceX96) => {
      handleSwap(poolAddress, sqrtPriceX96);
    });
    console.log(`📡 Swap listener adjuntado a ${poolAddress}`);
  } catch (err) {
    console.error(`❌ Error al adjuntar listener para ${poolAddress}:`, err.message);
  }
}

function detachSwapListenerIfUnused(poolAddress) {
  if (!poolAddress) return;
  const addrLower = poolAddress.toLowerCase();
  
  const stillInUse = Object.values(protectedPositions).some(
    pos => pos.poolAddress && pos.poolAddress.toLowerCase() === addrLower
  );
  
  if (!stillInUse && activePoolContracts[addrLower]) {
    try {
      activePoolContracts[addrLower].removeAllListeners();
      console.log(`⏹️ Listener removido para pool ${poolAddress} (no hay posiciones activas)`);
    } catch (e) {
      console.warn(`Error al remover listeners para ${poolAddress}:`, e.message);
    }
    delete activePoolContracts[addrLower];
  }
}

async function handleSwap(poolAddress, sqrtPriceX96) {
  const addrLower = poolAddress.toLowerCase();
  
  const matchingPositions = Object.entries(protectedPositions).filter(
    ([_, pos]) => pos.poolAddress && pos.poolAddress.toLowerCase() === addrLower
  );

  if (matchingPositions.length === 0) return;

  for (const [key, posData] of matchingPositions) {
    if (posData.isProcessingHedge) continue;
    posData.isProcessingHedge = true;

    try {
      const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
      let price1 = sqrtPrice ** 2 * (10 ** Number(posData.decimals0)) / (10 ** Number(posData.decimals1));
      let price2 = (1 / (sqrtPrice ** 2)) * (10 ** Number(posData.decimals1)) / (10 ** Number(posData.decimals0));

      let price = price1;
      if (posData.isReversed === undefined) {
        posData.isReversed = Math.abs(price2 - posData.lowerBound) < Math.abs(price1 - posData.lowerBound);
        await saveState();
      }
      if (posData.isReversed) price = price2;

      const stopLossPct = parseFloat(posData.stopLossPct || 0.5);

      console.log(`[${new Date().toLocaleTimeString()}] 📊 [ID: ${posData.positionId}] ${posData.symbol0}/${posData.symbol1} | Precio: ${price.toFixed(4)} | Límite: ${posData.lowerBound} | SHORT activo: ${posData.isHedged}`);

      if (price < posData.lowerBound && !posData.isHedged) {
        console.log(`🚨 ¡TRIGGER! Posición ${posData.positionId}: Precio (${price.toFixed(4)}) cayó del límite (${posData.lowerBound}). Abriendo SHORT...`);
        const success = await placeHedgeOrder(posData, price);
        if (success) {
          posData.isHedged = true;
          posData.hedgeEntryPrice = price;
          await saveState();
          console.log(`📌 Precio de entrada del SHORT guardado: ${price.toFixed(4)}`);
          console.log(`📌 El SHORT se cerrará cuando el precio suba ${stopLossPct}% (≥ ${(price * (1 + stopLossPct / 100)).toFixed(4)})`);
        }

      } else if (posData.isHedged && posData.hedgeEntryPrice) {
        const closeTarget = posData.hedgeEntryPrice * (1 + stopLossPct / 100);
        const isAboveTarget = price >= closeTarget;
        const isAboveUpper = price >= posData.upperBound;

        if (isAboveTarget || isAboveUpper) {
          if (isAboveUpper) {
            console.log(`⚠️ ¡ALERTA DE SEGURIDAD! Posición ${posData.positionId}: El precio (${price.toFixed(4)}) superó el límite superior (${posData.upperBound}). Cerrando SHORT de emergencia para evitar pérdidas descompensadas...`);
          } else {
            console.log(`🟢 ¡RECUPERACIÓN! Posición ${posData.positionId}: Precio (${price.toFixed(4)}) superó el objetivo (${closeTarget.toFixed(4)}). Cerrando SHORT...`);
          }
          const success = await closeHedgeOrder(posData, price);
          if (success) {
            posData.isHedged = false;
            posData.hedgeEntryPrice = null;
            await saveState();
            console.log(`🔁 SHORT cerrado. La posición ${posData.positionId} vuelve a modo GUARDIA.`);
          }
        }
      }
    } catch (err) {
      console.error(`Error procesando swap para posición ${posData.positionId}:`, err.message);
    } finally {
      posData.isProcessingHedge = false;
    }
  }
}

// ─────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────

// POST /api/bot/protect — Activar guardia para un pool
app.post('/api/bot/protect', requireAuth, async (req, res) => {
  const {
    poolAddress, lowerBound, upperBound,
    hedgeQty, hedgeSymbol, hedgeLeverage, stopLossPct,
    bitunixApiKey, bitunixApiSecret,
    orderType, positionId
  } = req.body;

  if (!poolAddress || !lowerBound || !upperBound) {
    return res.status(400).json({ error: "Faltan parámetros: poolAddress, lowerBound, upperBound" });
  }

  if (!wsProvider) {
    return res.status(500).json({ error: "WSS_RPC_URL no configurada. Configura el .env con tu nodo Arbitrum WebSocket." });
  }

  const key = req.userId + ':' + (positionId ? String(positionId) : poolAddress.toLowerCase());

  try {
    if (protectedPositions[key]) {
      Object.assign(protectedPositions[key], {
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
      await saveState();
      console.log(`🛡️ Posición ${key} actualizada.`);
      return res.json({ success: true, message: "Configuración actualizada", key });
    }

    console.log(`🔍 Analizando nuevo pool para posición ${key}: ${poolAddress}`);
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

    console.log(`✅ Pool verificado para posición ${key}: ${symbol0}/${symbol1}`);

    protectedPositions[key] = {
      userId: req.userId,
      positionId: positionId ? String(positionId) : null,
      poolAddress: poolAddress,
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
    await saveState();
    attachSwapListener(poolAddress);

    console.log(`🛡️ [El Haragán] Bot en GUARDIA para posición ${key} (${symbol0}/${symbol1})`);
    console.log(`   Límite inferior: ${lowerBound} | Stop-loss recovery: ${stopLossPct}%`);
    console.log(`   El SHORT se abrirá automáticamente cuando el precio caiga por debajo de ${lowerBound}`);

    let hedgeOpened = false;
    let hedgeError = null;
    try {
      const slot0 = await poolContract.slot0();
      const sqrtPrice = Number(slot0.sqrtPriceX96) / (2 ** 96);
      let price = sqrtPrice ** 2 * (10 ** Number(decimals0)) / (10 ** Number(decimals1));
      if (price < 0.0001) {
        price = (1 / (sqrtPrice ** 2)) * (10 ** Number(decimals1)) / (10 ** Number(decimals0));
      }
      console.log(`📊 Precio actual para posición ${key}: ${price.toFixed(4)} | Límite inferior: ${lowerBound}`);

      if (price < lowerBound) {
        console.log(`⚡ Precio por debajo del límite. Ejecutando SHORT INMEDIATO para posición ${key}...`);
        const success = await placeHedgeOrder(protectedPositions[key], price);
        if (success) {
          protectedPositions[key].isHedged = true;
          protectedPositions[key].hedgeEntryPrice = price;
          await saveState();
          hedgeOpened = true;
          console.log(`📌 ¡SHORT abierto en Bitunix para posición ${key}! Precio: ${price.toFixed(4)}`);
        } else {
          hedgeError = 'Bitunix rechazó la orden. Revisa tus claves API y que tengas saldo USDT en futuros.';
          console.error(`❌ Bitunix rechazó la orden SHORT para posición ${key}.`);
        }
      } else {
        console.log(`✅ Precio dentro del rango. Bot vigilando posición ${key}... se abrirá SHORT si baja de ${lowerBound}`);
      }
    } catch (e) {
      hedgeError = e.message;
      console.log(`⚠️ No se pudo evaluar precio para posición ${key}: ${e.message}`);
    }

    if (hedgeError) {
      delete protectedPositions[key];
      await saveState();
      detachSwapListenerIfUnused(poolAddress);
      return res.status(500).json({ success: false, error: hedgeError });
    }

    const msg = hedgeOpened 
      ? `SHORT abierto exitosamente para posición ${key} (${symbol0}/${symbol1})` 
      : `Vigilancia activa para posición ${key} (${symbol0}/${symbol1}). SHORT se abrirá automáticamente al salir de rango.`;
    res.json({ success: true, hedgeOpened, message: msg, key });

  } catch (error) {
    console.error(`❌ Error al proteger posición ${key}:`, error.message);
    res.status(500).json({ error: "Error al conectar con el contrato", details: error.message });
  }
});

// POST /api/bot/unprotect — Desactivar guardia
app.post('/api/bot/unprotect', requireAuth, async (req, res) => {
  const { poolAddress, positionId } = req.body;
  if (!poolAddress) return res.status(400).json({ error: "Falta poolAddress" });

  const key = req.userId + ':' + (positionId ? String(positionId) : poolAddress.toLowerCase());

  if (protectedPositions[key]) {
    const pos = protectedPositions[key];
    if (pos.isHedged) {
      const closePriceRef = pos.hedgeEntryPrice || 0;
      console.log(`🔒 Cerrando SHORT activo antes de desactivar guardia para posición ${key}... Precio de referencia: ${closePriceRef}`);
      await closeHedgeOrder(pos, closePriceRef);
    }
    delete protectedPositions[key];
    await saveState();
    detachSwapListenerIfUnused(poolAddress);
    console.log(`🛑 Guardia desactivada para posición ${key}`);
    res.json({ success: true, message: "Guardia desactivada", key });
  } else {
    res.json({ success: true, message: "Posición no estaba protegida", key });
  }
});

// GET /api/bot/status — Estado del bot
app.get('/api/bot/status', requireAuth, (req, res) => {
  const activePools = Object.entries(protectedPositions)
    .filter(([_, pos]) => pos.userId === req.userId)
    .map(([key, pos]) => ({
      key,
      positionId: pos.positionId,
      address: pos.poolAddress,
      symbol0: pos.symbol0,
      symbol1: pos.symbol1,
      lowerBound: pos.lowerBound,
      upperBound: pos.upperBound,
      isHedged: pos.isHedged,
      hedgeEntryPrice: pos.hedgeEntryPrice,
      hedgeSymbol: pos.hedgeSymbol,
      hedgeQty: pos.hedgeQty,
      stopLossPct: pos.stopLossPct,
      hasApiKey: !!(pos.apiKey || ENV_API_KEY)
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
  console.log(`Posiciones activas: ${Object.keys(protectedPositions).length}`);
  console.log(`\nFlujo activo:`);
  console.log(`  1. Precio cae del límite inferior → SHORT abierto automáticamente`);
  console.log(`  2. Precio sube el % de stop-loss  → SHORT cerrado automáticamente`);
  console.log(`  3. Ciclo se repite infinitamente hasta que pares la guardia`);
  console.log(`\nEsperando configuraciones del dashboard...`);
});
