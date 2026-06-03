/**
 * Bot Helper para interactuar con la API de Bitunix Futuros.
 * Utiliza Web Crypto API para firmar peticiones localmente (HMAC SHA256) 
 * sin depender de librerías externas ni exponer el secreto.
 */

const BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/bitunix-api` : (import.meta.env.DEV ? 'http://localhost:3002/bitunix-api' : '/bitunix-api');

// Mapa de corrección: tokens wrapped → símbolo real en Bitunix
const SYMBOL_MAP = {
  'WETH':   'ETH',
  'WBTC':   'BTC',
  'WMATIC': 'MATIC',
  'WAVAX':  'AVAX',
  'WBNB':   'BNB',
};

// Tamaño de contrato por par en Bitunix Futures (qty = tokens / contractSize)
const CONTRACT_SIZE = {
  'ETHUSDT':  0.01,
  'BTCUSDT':  0.001,
  'MATICUSDT': 1,
  'BNBUSDT':  0.01,
  'AVAXUSDT': 0.1,
};

/**
 * Convierte un símbolo de token LP al par correcto de Bitunix.
 * Ej: "WETH" → "ETHUSDT"
 */
export function toBitunixSymbol(tokenSymbol) {
  const upper = tokenSymbol.toUpperCase();
  const mapped = SYMBOL_MAP[upper] || upper;
  return `${mapped}USDT`;
}

/**
 * Convierte cantidad de tokens al número de contratos que Bitunix espera.
 * Ej: 0.5 ETH → 0.5 / 0.01 = 50 contratos ETHUSDT
 */
export function toContractQty(symbol, tokenQty) {
  const contractSize = CONTRACT_SIZE[symbol.toUpperCase()] || 1;
  const contracts = tokenQty / contractSize;
  return parseFloat(contracts.toFixed(0)); // Bitunix acepta enteros para qty de contratos
}


/**
/**
 * Genera la firma exacta requerida por Bitunix: SHA256( SHA256(nonce + timestamp + apiKey + queryParams + body) + secretKey )
 */
async function generateSignature(apiKey, secret, nonce, timestamp, queryParams, bodyString) {
  const enc = new TextEncoder();
  
  const digestInput = nonce + timestamp + apiKey + queryParams + bodyString;
  const digestBuf = await window.crypto.subtle.digest('SHA-256', enc.encode(digestInput));
  const digestHex = Array.from(new Uint8Array(digestBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const signInput = digestHex + secret;
  const signBuf = await window.crypto.subtle.digest('SHA-256', enc.encode(signInput));
  return Array.from(new Uint8Array(signBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Realiza una petición autenticada a la API de Bitunix.
 */
export async function bitunixApiCall(endpoint, method, apiKey, apiSecret, body = {}) {
  const timestamp = Date.now().toString();
  const nonce = Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  
  const bodyString = Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  const queryParams = ''; // No query params in POST /order
  
  const signature = await generateSignature(apiKey, apiSecret, nonce, timestamp, queryParams, bodyString);
  
  const headers = {
    'Content-Type': 'application/json',
    'api-key': apiKey,
    'timestamp': timestamp,
    'nonce': nonce,
    'sign': signature
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: method === 'POST' ? bodyString : undefined
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP Error: ${response.status} - ${errText}`);
  }

  const json = await response.json();
  if (json.code !== 0) {
    throw new Error(`[${json.code}] ${json.msg}`);
  }

  return json;
}

/**
 * Cambia el apalancamiento de un símbolo en Bitunix Futuros.
 */
export async function setBitunixLeverage(symbol, leverage, credentials) {
  const { apiKey, apiSecret } = credentials;
  if (!apiKey || !apiSecret) return;
  
  const endpoint = '/api/v1/futures/account/change_leverage';
  const payload = {
    symbol: symbol.toUpperCase(),
    leverage: Number(leverage)
  };

  try {
    console.log(`[Bitunix] Configurando apalancamiento a ${leverage}x para ${symbol}`);
    await bitunixApiCall(endpoint, 'POST', apiKey, apiSecret, payload);
  } catch (err) {
    console.warn(`[Bitunix] Aviso al intentar configurar apalancamiento: ${err.message}`);
    // No lanzamos throw aquí para no interrumpir la orden si el leverage ya estaba bien o no se permite cambiar
  }
}

/**
 * Abre una posición Market en Bitunix Futuros.
 * 
 * @param {string} symbol - Par de trading (ej. "BTCUSDT")
 * @param {string} side - "buy_open" o "sell_open"
 * @param {number} size - Cantidad de tokens
 * @param {object} credentials - { apiKey, apiSecret }
 * @param {number} leverage - Apalancamiento a configurar (default 10)
 */
export async function openBitunixPosition(symbol, side, size, credentials, leverage = 10) {
  const { apiKey, apiSecret } = credentials;
  
  if (!apiKey || !apiSecret) {
    throw new Error('Faltan credenciales de Bitunix');
  }

  // Ajusta la ruta exacta según la API oficial de Bitunix Futures
  const endpoint = '/api/v1/futures/trade/place_order';
  const isShort = side.toUpperCase().includes('SELL');
  const payload = {
    symbol: symbol.toUpperCase(),
    side: isShort ? 'SELL' : 'BUY',
    orderType: "MARKET",
    qty: String(size),
    tradeSide: "OPEN",
    effect: 'GTC',
    reduceOnly: false
  };

  try {
    // 1. Configurar apalancamiento primero
    await setBitunixLeverage(symbol, leverage, credentials);

    // 2. Colocar la orden
    const response = await bitunixApiCall(endpoint, 'POST', apiKey, apiSecret, payload);
    return response;
  } catch (err) {
    throw new Error(`Error al abrir posición en Bitunix: ${err.message}`);
  }
}

/**
 * Helper rápido para abrir SHORT.
 * Convierte automáticamente el símbolo (WETH→ETH) y la qty a contratos.
 */
export async function openShortPosition(symbol, sizeInTokens, credentials, leverage = 10) {
  const correctedSymbol = toBitunixSymbol(symbol.replace('USDT', '')); // por si ya viene con USDT
  
  // Usamos el tamaño en tokens directamente formateado a 4 decimales
  const finalSize = parseFloat(Number(sizeInTokens).toFixed(4));
  return openBitunixPosition(correctedSymbol, 'SELL', finalSize, credentials, leverage);
}

/**
 * Helper rápido para abrir LONG.
 */
export async function openLongPosition(symbol, sizeInTokens, credentials, leverage = 10) {
  const correctedSymbol = toBitunixSymbol(symbol.replace('USDT', ''));
  const finalSize = parseFloat(Number(sizeInTokens).toFixed(4));
  return openBitunixPosition(correctedSymbol, 'BUY', finalSize, credentials, leverage);
}

/**
 * Cierra una posición SHORT existente en Bitunix (orden BUY CLOSE a mercado).
 * @param {string} symbol - Par de trading (ej. "ETHUSDT")
 * @param {number} sizeInTokens - Cantidad de tokens a cerrar (se convierte a contratos)
 * @param {object} credentials - { apiKey, apiSecret }
 */
export async function closeShortPosition(symbol, sizeInTokens, credentials) {
  const { apiKey, apiSecret } = credentials;
  if (!apiKey || !apiSecret) throw new Error('Faltan credenciales de Bitunix');

  const correctedSymbol = toBitunixSymbol(symbol.replace('USDT', ''));
  const finalSize = parseFloat(Number(sizeInTokens).toFixed(4));

  const endpoint = '/api/v1/futures/trade/place_order';
  const payload = {
    symbol: correctedSymbol,
    side: 'BUY',
    orderType: 'MARKET',
    qty: String(finalSize),
    tradeSide: 'CLOSE',
    effect: 'GTC',
    reduceOnly: true
  };

  try {
    console.log(`[Bitunix] Cerrando SHORT de ${finalSize} tokens de ${correctedSymbol}...`);
    const response = await bitunixApiCall(endpoint, 'POST', apiKey, apiSecret, payload);
    console.log(`[Bitunix] SHORT cerrado exitosamente.`);
    return response;
  } catch (err) {
    throw new Error(`Error al cerrar SHORT en Bitunix: ${err.message}`);
  }
}
