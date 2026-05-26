import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY    = process.env.BITUNIX_API_KEY || '2fd32cfddbb26366c5f90d709b914b81';
const API_SECRET = process.env.BITUNIX_API_SECRET || 'ffa77a2fa9b6fa30664e8cf110501fb5';

function buildSignature(apiKey, apiSecret, nonce, timestamp, queryParams, bodyString) {
  const digestInput = nonce + timestamp + apiKey + queryParams + bodyString;
  const digest = crypto.createHash('sha256').update(digestInput).digest('hex');
  return crypto.createHash('sha256').update(digest + apiSecret).digest('hex');
}

async function bitunixRequest(endpoint, method = 'GET', queryParams = '', body = null) {
  const timestamp  = Date.now().toString();
  const nonce      = crypto.randomBytes(16).toString('hex');
  const bodyString = body ? JSON.stringify(body) : '';
  const signature  = buildSignature(API_KEY, API_SECRET, nonce, timestamp, queryParams, bodyString);

  const url = `http://localhost:3001/bitunix-api${endpoint}${queryParams ? '?' + queryParams : ''}`;
  
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key':   API_KEY,
      'timestamp': timestamp,
      'nonce':     nonce,
      'sign':      signature
    },
    ...(bodyString && { body: bodyString })
  });

  try {
    return await res.json();
  } catch {
    return { code: -1, raw: await res.text() };
  }
}

async function checkBitunix() {
  console.log('\n🔍 Verificando estado de cuenta Bitunix...\n');

  // ── 1. POSICIONES ABIERTAS (endpoint correcto de Bitunix Futures) ──────────
  console.log('─── POSICIONES ABIERTAS ───────────────────────────');
  const posRes = await bitunixRequest('/api/v1/futures/position/get_pending_positions', 'GET', 'symbol=ETHUSDT');
  
  if (posRes.code === 0) {
    const list = posRes.data?.list || posRes.data?.positionList || posRes.data || [];
    const arr  = Array.isArray(list) ? list : Object.values(list);
    if (arr.length === 0) {
      console.log('❌ No hay posiciones abiertas de ETHUSDT en este momento.');
    } else {
      arr.forEach((p, i) => {
        const dir = (p.side || p.positionSide || '').toUpperCase();
        console.log(`\n✅ Posición ${i + 1}:`);
        console.log(`   Par:         ${p.symbol}`);
        console.log(`   Dirección:   ${dir} ${dir === 'SELL' || dir === 'SHORT' ? '← SHORT (cobertura activa)' : ''}`);
        console.log(`   Contratos:   ${p.size ?? p.qty ?? '?'}`);
        console.log(`   Precio ent:  ${p.avgPrice ?? p.entryPrice ?? '?'}`);
        console.log(`   PNL latente: ${p.unrealizedPnl ?? p.unPnl ?? '?'} USDT`);
        console.log(`   Leverage:    ${p.leverage ?? '?'}x`);
      });
    }
  } else {
    console.log('Código:', posRes.code, '| Mensaje:', posRes.msg);
    // Intentar con endpoint alternativo
    console.log('\nIntentando endpoint alternativo...');
    const alt = await bitunixRequest('/api/v1/futures/position/get_position_list', 'GET', 'symbol=ETHUSDT');
    console.log('Alt response:', JSON.stringify(alt).substring(0, 200));
  }

  // ── 2. ÓRDENES RECIENTES ────────────────────────────────────────────────────
  console.log('\n─── ÚLTIMAS ÓRDENES ───────────────────────────────');
  const ordRes = await bitunixRequest('/api/v1/futures/trade/get_order_list', 'GET', 'symbol=ETHUSDT&pageSize=5');

  if (ordRes.code === 0) {
    const list = ordRes.data?.orderList || ordRes.data?.list || ordRes.data || [];
    const arr  = Array.isArray(list) ? list : [];
    if (arr.length === 0) {
      console.log('No hay órdenes recientes de ETHUSDT.');
    } else {
      arr.forEach((o, i) => {
        const t = new Date(Number(o.ctime || o.createTime || 0)).toLocaleTimeString('es-ES');
        const estado = o.status || o.orderStatus;
        const filledMark = estado === 'FILLED' ? ' ← EJECUTADA ✅' : '';
        console.log(`\n📋 Orden ${i + 1}: ${o.side} ${o.qty ?? o.size} ${o.symbol} | Tipo: ${o.orderType} | Estado: ${estado}${filledMark} | ${t}`);
      });
    }
  } else {
    console.log('Código:', ordRes.code, '| Mensaje:', ordRes.msg);
  }

  // ── 3. BALANCE ──────────────────────────────────────────────────────────────
  console.log('\n─── BALANCE FUTURES ───────────────────────────────');
  const balRes = await bitunixRequest('/api/v1/futures/account/get_single_account', 'GET', 'coin=USDT');
  
  if (balRes.code === 0) {
    const d = balRes.data;
    console.log(`💰 Disponible: ${d?.availableBalance ?? d?.available ?? '?'} USDT`);
    console.log(`💰 Total:      ${d?.walletBalance ?? d?.balance ?? '?'} USDT`);
    console.log(`💰 Margen en uso: ${d?.initialMargin ?? d?.usedMargin ?? '?'} USDT`);
  } else {
    // Intentar endpoint alternativo
    const bal2 = await bitunixRequest('/api/v1/futures/account/get_account_assets', 'GET', '');
    if (bal2.code === 0) {
      const assets = bal2.data?.assets || bal2.data || [];
      const usdt = Array.isArray(assets) ? assets.find(a => a.asset === 'USDT' || a.coin === 'USDT') : null;
      if (usdt) {
        console.log(`💰 Disponible: ${usdt.availableBalance ?? usdt.available} USDT`);
        console.log(`💰 Total:      ${usdt.walletBalance ?? usdt.balance} USDT`);
      } else {
        console.log('Balance raw:', JSON.stringify(bal2.data).substring(0, 200));
      }
    } else {
      console.log('Balance código:', balRes.code, balRes.msg, '| Alt código:', bal2.code, bal2.msg);
    }
  }

  console.log('\n──────────────────────────────────────────────────\n');
}

checkBitunix();
