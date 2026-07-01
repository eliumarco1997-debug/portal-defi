import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

let supabase;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (err) {
    console.error('Error inicializando Supabase:', err.message);
  }
} else {
  console.warn('Advertencia: Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY.');
}

const app = express();

function validateEnv() {
  const required = ['WSS_RPC_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'ENCRYPTION_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn('ADVERTENCIA: Faltan variables de entorno: ' + missing.join(', '));
  }
  const EK = process.env.ENCRYPTION_KEY;
  if (EK && EK.length !== 32) {
    console.error('ERROR CRITICO: ENCRYPTION_KEY debe tener exactamente 32 caracteres. Actualmente tiene: ' + EK.length);
  }
}
validateEnv();

const PORT = process.env.PORT || 3002;
const WSS_RPC_URL = process.env.WSS_RPC_URL || 'wss://arb-mainnet.g.alchemy.com/v2/znxN0ZZnPA2F1f62XbSwR';
const ENV_API_KEY = process.env.BITUNIX_API_KEY;
const ENV_API_SECRET = process.env.BITUNIX_API_SECRET;

const allowedOrigins = [
  'https://portal-defi-production.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3002'
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Origen bloqueado: ' + origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta token de autorizacion' });
  }
  if (!supabase) {
    return res.status(500).json({ error: 'El servidor de autenticacion no esta configurado.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.warn('[AUTH] Token invalido enviado a ' + req.path);
      return res.status(401).json({ error: 'Token de autenticacion invalido' });
    }
    req.userId = user.id;
    next();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[AUTH] Timeout al verificar JWT con Supabase (>5s)');
      return res.status(503).json({ error: 'Timeout del servidor de autenticacion' });
    }
    console.error('[AUTH] Error verificando JWT:', err.message);
    return res.status(500).json({ error: 'Error interno de autenticacion' });
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
    console.error('Error en proceso de encriptacion.');
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
    console.error('Error en proceso de desencriptacion.');
    return null;
  }
}

let protectedPositions = {};
const activePoolContracts = {};

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout de red (>' + timeoutMs + 'ms): ' + url.substring(0, 40));
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

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
      await fetchWithTimeout(UPSTASH_URL + '/set/protectedPools', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + UPSTASH_TOKEN },
        body: JSON.stringify(stateToSave)
      }, 8000);
    } else {
      fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
    }
  } catch (e) {
    console.error('Error al guardar estado:', e.message);
  }
}

async function loadState() {
  try {
    let rawData = null;
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      const res = await fetchWithTimeout(UPSTASH_URL + '/get/protectedPools', {
        headers: { Authorization: 'Bearer ' + UPSTASH_TOKEN }
      }, 8000);
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
          if (item.apiKey) { const dec = decrypt(item.apiKey); if (dec) item.apiKey = dec; }
          if (item.apiSecret) { const dec = decrypt(item.apiSecret); if (dec) item.apiSecret = dec; }
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
      console.log('Estado cargado (' + (UPSTASH_URL ? 'Redis' : STATE_FILE) + '): ' + Object.keys(protectedPositions).length + ' posiciones activas.');
    }
  } catch (e) {
    console.error('Error al cargar estado:', e.message);
  }
}

await loadState();

const POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
];

const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
];

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
  const res = await fetchWithTimeout('https://fapi.bitunix.com' + endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      'timestamp': timestamp,
      'nonce': nonce,
      'sign': signature
    },
    body: method === 'POST' ? bodyString : undefined
  }, 10000);
  const text = await res.text();
  return { status: res.status, body: text };
}

async function setLeverage(symbol, leverage, apiKey, apiSecret) {
  try {
    const res = await bitunixRequest('/api/v1/futures/account/change_leverage', 'POST', apiKey, apiSecret,
      { symbol: symbol.toUpperCase(), marginCoin: 'USDT', leverage: Number(leverage) });
    const parsed = JSON.parse(res.body);
    if (parsed.code === 0) {
      console.log('[Bitunix] Apalancamiento cambiado a ' + leverage + 'x.');
      return true;
    } else {
      console.error('[Bitunix] RECHAZO cambio de leverage: ' + parsed.msg);
      return false;
    }
  } catch (err) {
    console.warn('[Bitunix] Error al configurar leverage: ' + err.message);
    return false;
  }
}

async function placeHedgeOrder(pool, triggerPrice) {
  const { hedgeSymbol, hedgeQty, hedgeLeverage, apiKey, apiSecret } = pool;
  const key = apiKey || ENV_API_KEY;
  const secret = apiSecret || ENV_API_SECRET;
  if (!key || !secret) { console.error('Faltan credenciales de Bitunix.'); return false; }

  await setLeverage(hedgeSymbol, hedgeLeverage, key, secret);
  const qty = parseFloat(hedgeQty);
  pool.lastOpenedQty = qty;
  const requestedType = pool.orderType || 'LIMIT';
  let success = false;

  if (requestedType.toUpperCase() === 'LIMIT') {
    const maxSlippagePct = pool.maxSlippagePct || 0.3;
    const limitPrice = triggerPrice * (1 - (maxSlippagePct / 100));
    const limitPriceStr = limitPrice.toFixed(4);
    console.log('[Bitunix] Abriendo SHORT LIMIT: ' + qty + ' x ' + hedgeSymbol + ' @ ' + limitPriceStr);
    const payload = { symbol: hedgeSymbol, side: 'SELL', orderType: 'LIMIT', price: limitPriceStr, qty: String(qty), tradeSide: 'OPEN', effect: 'GTC', reduceOnly: false };
    try {
      const res = await bitunixRequest('/api/v1/futures/trade/place_order', 'POST', key, secret, payload);
      const parsed = JSON.parse(res.body);
      if (res.status === 200 && parsed.code === 0) { console.log('[Bitunix] SHORT LIMIT OK!'); success = true; }
      else { console.log('[Bitunix] Error SHORT LIMIT, ejecutando FALLBACK MARKET...'); }
    } catch (err) { console.warn('[Bitunix] Red error LIMIT: ' + err.message + '. FALLBACK MARKET...'); }
  }

  if (!success) {
    console.log('[Bitunix] Abriendo SHORT MARKET: ' + qty + ' x ' + hedgeSymbol);
    const payload = { symbol: hedgeSymbol, side: 'SELL', orderType: 'MARKET', qty: String(qty), tradeSide: 'OPEN', effect: 'GTC', reduceOnly: false };
    try {
      const res = await bitunixRequest('/api/v1/futures/trade/place_order', 'POST', key, secret, payload);
      const parsed = JSON.parse(res.body);
      if (res.status === 200 && parsed.code === 0) { console.log('[Bitunix] SHORT MARKET OK!'); success = true; }
      else { console.error('[Bitunix] Error SHORT MARKET: ' + (parsed.msg || res.body)); }
    } catch (err) { console.error('[Bitunix] Red error MARKET:', err.message); }
  }
  return success;
}

async function closeHedgeOrder(pool) {
  const { hedgeSymbol, hedgeQty, apiKey, apiSecret, lastOpenedQty } = pool;
  const key = apiKey || ENV_API_KEY;
  const secret = apiSecret || ENV_API_SECRET;
  if (!key || !secret) return false;
  const qty = lastOpenedQty || parseFloat(hedgeQty);
  console.log('[Bitunix] Cerrando SHORT BUY MARKET: ' + qty + ' x ' + hedgeSymbol);
  const payload = { symbol: hedgeSymbol, side: 'BUY', orderType: 'MARKET', qty: String(qty), tradeSide: 'CLOSE', effect: 'GTC', reduceOnly: true };
  try {
    const res = await bitunixRequest('/api/v1/futures/trade/place_order', 'POST', key, secret, payload);
    if (res.status === 200 && res.body.includes('"code":0')) { console.log('[Bitunix] SHORT cerrado OK!'); return true; }
    else { console.log('[Bitunix] Error al cerrar SHORT. HTTP ' + res.status); return false; }
  } catch (err) { console.error('[Bitunix] Red error al cerrar:', err.message); return false; }
}

let wsProvider;
let isReconnecting = false;

function cleanWssUrl(raw) {
  if (!raw) return raw;
  let url = raw.trim();
  if (url.includes('[')) { const m = url.match(/\[([^\]]+)\]/); if (m) url = m[1]; }
  if (url.startsWith('https://')) url = url.replace('https://', 'wss://');
  else if (url.startsWith('http://')) url = url.replace('http://', 'ws://');
  if (!url.startsWith('wss://') && !url.startsWith('ws://')) url = 'wss://' + url;
  return url;
}

function connectWSS() {
  if (isReconnecting) return;
  isReconnecting = true;
  console.log('Conectando al proveedor WebSocket de Alchemy...');
  try {
    const wssUrl = cleanWssUrl(WSS_RPC_URL);
    if (!wssUrl || wssUrl.includes('DEMO_KEY_PLEASE_REPLACE')) {
      console.warn('WSS_RPC_URL no configurada o demo detectada.');
      isReconnecting = false;
      return;
    }
    wsProvider = new ethers.WebSocketProvider(wssUrl);
    const socket = wsProvider.websocket;
    socket.onopen = () => {
      console.log('Conexion WebSocket establecida con Alchemy.');
      isReconnecting = false;
      restoreListeners();
    };
    socket.onerror = (error) => {
      console.error('Error en WebSocket RPC:', error.message || 'desconocido');
      handleWssDisconnect();
    };
    socket.onclose = (event) => {
      console.warn('Conexion WebSocket cerrada. Codigo: ' + event.code);
      handleWssDisconnect();
    };
  } catch (error) {
    console.error('Error al instanciar WebSocketProvider:', error.message);
    handleWssDisconnect();
  }
}

function handleWssDisconnect() {
  isReconnecting = false;
  if (wsProvider) {
    try { wsProvider.destroy(); } catch (e) {}
    wsProvider = null;
  }
  Object.keys(activePoolContracts).forEach(k => delete activePoolContracts[k]);
  console.log('Reintentando conexion WebSocket en 5 segundos...');
  setTimeout(connectWSS, 5000);
}

connectWSS();

function restoreListeners() {
  if (!wsProvider) return;
  const uniquePoolAddresses = [...new Set(Object.values(protectedPositions).map(pos => pos.poolAddress))];
  for (const poolAddress of uniquePoolAddresses) {
    if (poolAddress) {
      attachSwapListener(poolAddress);
      console.log('Listener restaurado para pool ' + poolAddress);
    }
  }
}

function attachSwapListener(poolAddress) {
  if (!poolAddress || !wsProvider) return;
  const addrLower = poolAddress.toLowerCase();
  if (activePoolContracts[addrLower]) return;
  try {
    const contract = new ethers.Contract(poolAddress, POOL_ABI, wsProvider);
    activePoolContracts[addrLower] = contract;
    contract.on('Swap', (sender, recipient, amount0, amount1, sqrtPriceX96) => {
      handleSwap(poolAddress, sqrtPriceX96);
    });
    console.log('Swap listener adjuntado a ' + poolAddress);
  } catch (err) {
    console.error('Error al adjuntar listener para ' + poolAddress + ':', err.message);
  }
}

function detachSwapListenerIfUnused(poolAddress) {
  if (!poolAddress) return;
  const addrLower = poolAddress.toLowerCase();
  const stillInUse = Object.values(protectedPositions).some(
    pos => pos.poolAddress && pos.poolAddress.toLowerCase() === addrLower
  );
  if (!stillInUse && activePoolContracts[addrLower]) {
    try { activePoolContracts[addrLower].removeAllListeners(); } catch (e) {}
    delete activePoolContracts[addrLower];
    console.log('Listener removido para pool ' + poolAddress);
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
      const price1 = sqrtPrice ** 2 * (10 ** Number(posData.decimals0)) / (10 ** Number(posData.decimals1));
      const price2 = (1 / (sqrtPrice ** 2)) * (10 ** Number(posData.decimals1)) / (10 ** Number(posData.decimals0));

      if (posData.isReversed === undefined) {
        const stablecoins = ['USDC', 'USDT', 'USDC.E', 'USDT.E', 'DAI', 'USDt', 'USDC.e'];
        const t0 = (posData.symbol0 || '').toUpperCase();
        const t1 = (posData.symbol1 || '').toUpperCase();
        posData.isReversed = stablecoins.includes(t0) && !stablecoins.includes(t1);
        await saveState();
      }

      const price = posData.isReversed ? price2 : price1;
      const stopLossPct = parseFloat(posData.stopLossPct || 0.5);

      console.log('[' + new Date().toLocaleTimeString() + '] [ID: ' + posData.positionId + '] ' + posData.symbol0 + '/' + posData.symbol1 + ' | Precio: ' + price.toFixed(4) + ' | Limite: ' + posData.lowerBound + ' | SHORT activo: ' + posData.isHedged);

      if (price < posData.lowerBound && !posData.isHedged) {
        console.log('TRIGGER! Posicion ' + posData.positionId + ': Precio (' + price.toFixed(4) + ') cayo del limite (' + posData.lowerBound + '). Abriendo SHORT...');
        const success = await placeHedgeOrder(posData, price);
        if (success) {
          posData.isHedged = true;
          posData.hedgeEntryPrice = price;
          await saveState();
        }
      } else if (posData.isHedged && posData.hedgeEntryPrice) {
        const closeTarget = posData.hedgeEntryPrice * (1 + stopLossPct / 100);
        if (price >= closeTarget || price >= posData.upperBound) {
          console.log('RECUPERACION! Posicion ' + posData.positionId + ': Precio (' + price.toFixed(4) + '). Cerrando SHORT...');
          const success = await closeHedgeOrder(posData);
          if (success) {
            posData.isHedged = false;
            posData.hedgeEntryPrice = null;
            await saveState();
          }
        }
      }
    } catch (err) {
      console.error('Error procesando swap para posicion ' + posData.positionId + ':', err.message);
    } finally {
      posData.isProcessingHedge = false;
    }
  }
}

app.post('/api/bot/protect', requireAuth, async (req, res) => {
  const { poolAddress, lowerBound, upperBound, hedgeQty, hedgeSymbol, hedgeLeverage, stopLossPct, bitunixApiKey, bitunixApiSecret, orderType, positionId } = req.body;
  if (!poolAddress || !lowerBound || !upperBound) {
    return res.status(400).json({ error: 'Faltan parametros: poolAddress, lowerBound, upperBound' });
  }
  if (!wsProvider) {
    return res.status(500).json({ error: 'WSS_RPC_URL no configurada.' });
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
      return res.json({ success: true, message: 'Configuracion actualizada', key });
    }

    const httpProvider = new ethers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, httpProvider);
    const token0Address = await poolContract.token0();
    const token1Address = await poolContract.token1();
    const token0Contract = new ethers.Contract(token0Address, ERC20_ABI, httpProvider);
    const token1Contract = new ethers.Contract(token1Address, ERC20_ABI, httpProvider);
    const decimals0 = await token0Contract.decimals();
    const decimals1 = await token1Contract.decimals();
    const symbol0 = await token0Contract.symbol();
    const symbol1 = await token1Contract.symbol();

    protectedPositions[key] = {
      userId: req.userId,
      positionId: positionId ? String(positionId) : null,
      poolAddress,
      lowerBound, upperBound,
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

    let hedgeOpened = false;
    let hedgeError = null;
    try {
      const slot0 = await poolContract.slot0();
      const sqrtPrice = Number(slot0.sqrtPriceX96) / (2 ** 96);
      let price = sqrtPrice ** 2 * (10 ** Number(decimals0)) / (10 ** Number(decimals1));
      if (price < 0.0001) price = (1 / (sqrtPrice ** 2)) * (10 ** Number(decimals1)) / (10 ** Number(decimals0));
      if (price < lowerBound) {
        const success = await placeHedgeOrder(protectedPositions[key], price);
        if (success) {
          protectedPositions[key].isHedged = true;
          protectedPositions[key].hedgeEntryPrice = price;
          await saveState();
          hedgeOpened = true;
        } else {
          hedgeError = 'Bitunix rechazo la orden. Revisa tus claves API y saldo USDT.';
        }
      }
    } catch (e) {
      hedgeError = e.message;
    }

    if (hedgeError) {
      delete protectedPositions[key];
      await saveState();
      detachSwapListenerIfUnused(poolAddress);
      return res.status(500).json({ success: false, error: hedgeError });
    }

    res.json({ success: true, hedgeOpened, message: hedgeOpened ? 'SHORT abierto para ' + key : 'Vigilancia activa para ' + key, key });
  } catch (error) {
    console.error('Error al proteger posicion ' + key + ':', error.message);
    res.status(500).json({ error: 'Error al conectar con el contrato', details: error.message });
  }
});

app.post('/api/bot/unprotect', requireAuth, async (req, res) => {
  const { poolAddress, positionId } = req.body;
  if (!poolAddress) return res.status(400).json({ error: 'Falta poolAddress' });
  const key = req.userId + ':' + (positionId ? String(positionId) : poolAddress.toLowerCase());
  if (protectedPositions[key]) {
    const pos = protectedPositions[key];
    if (pos.isHedged) await closeHedgeOrder(pos);
    delete protectedPositions[key];
    await saveState();
    detachSwapListenerIfUnused(poolAddress);
    res.json({ success: true, message: 'Guardia desactivada', key });
  } else {
    res.json({ success: true, message: 'Posicion no estaba protegida', key });
  }
});

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
  res.json({ status: 'running', connectedToWSS: !!wsProvider, activeProtections: activePools.length, pools: activePools });
});

app.use('/bitunix-api', (req, res) => {
  const options = {
    hostname: 'fapi.bitunix.com',
    path: req.url,
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
    res.writeHead(proxyRes.statusCode, { 'Access-Control-Allow-Origin': '*', 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', (e) => { res.status(500).send('Proxy Error: ' + e.message); });
  if (req.method === 'POST' || req.method === 'PUT') { req.pipe(proxyReq, { end: true }); } else { proxyReq.end(); }
});

app.use('/revert-api', (req, res) => {
  const options = { hostname: 'api.revert.finance', path: req.url, method: req.method, headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } };
  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, { 'Access-Control-Allow-Origin': '*', 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', (e) => { res.status(500).send('Proxy Error: ' + e.message); });
  if (req.method === 'POST' || req.method === 'PUT') { req.pipe(proxyReq, { end: true }); } else { proxyReq.end(); }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (fs.existsSync(path.join(__dirname, 'dist'))) {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
} else {
  app.get('*', (req, res) => { res.status(404).send('Ejecuta npm run build o revisa la carpeta dist.'); });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n=================================================');
  console.log('Motor El Haragan iniciado en el puerto ' + PORT);
  console.log('=================================================');
  console.log('WSS conectado: ' + !!wsProvider);
  console.log('Posiciones activas: ' + Object.keys(protectedPositions).length);
  console.log('\nFlujo activo:');
  console.log('  1. Precio cae del limite inferior - SHORT abierto automaticamente');
  console.log('  2. Precio sube el % de stop-loss  - SHORT cerrado automaticamente');
  console.log('  3. Ciclo se repite hasta que pares la guardia');
  console.log('\nEsperando configuraciones del dashboard...');
});