import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// ⚠️ PON TUS CLAVES EN EL ARCHIVO .ENV:
const API_KEY = process.env.BITUNIX_API_KEY || '2fd32cfddbb26366c5f90d709b914b81';
const API_SECRET = process.env.BITUNIX_API_SECRET || 'ffa77a2fa9b6fa30664e8cf110501fb5';

async function testBitunix() {
  if (API_KEY.includes('PON_TU')) {
    console.log('❌ Error: Debes poner tu API Key y Secret en el archivo test-keys.js primero.');
    return;
  }

  console.log('Conectando con el servidor puente (localhost:3001) para evadir Cloudflare...');

  const endpoint = '/api/v1/futures/trade/place_order';
  const method = 'POST';
  const body = {
    symbol: 'ETHUSDT',
    side: 'SELL',
    orderType: 'MARKET',
    qty: '0.01',
    tradeSide: 'OPEN',
    effect: 'GTC',
    reduceOnly: false
  };

  const bodyString = JSON.stringify(body);
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const queryParams = "";

  // Firma exacta de Bitunix: SHA256( SHA256(nonce + timestamp + apiKey + queryParams + body) + secretKey )
  const digestInput = nonce + timestamp + API_KEY + queryParams + bodyString;
  const digest = crypto.createHash('sha256').update(digestInput).digest('hex');
  const signInput = digest + API_SECRET;
  const signature = crypto.createHash('sha256').update(signInput).digest('hex');

  try {
    const response = await fetch(`http://localhost:3001/bitunix-api${endpoint}`, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'api-key': API_KEY,
        'timestamp': timestamp,
        'nonce': nonce,
        'sign': signature
      },
      body: bodyString
    });

    const data = await response.text();
    console.log('\n--- RESPUESTA DE BITUNIX ---');
    console.log(`Status HTTP: ${response.status}`);
    console.log(`Cuerpo: ${data}`);

    if (response.status === 200 && data.includes('"code":0')) {
      console.log('\n✅ ¡ÉXITO! Cloudflare no bloqueó la petición y tus claves tienen permisos.');
    } else {
      console.log('\n❌ Fallo. Revisa el error de arriba.');
    }
  } catch (err) {
    console.error('\n❌ Error de red (¿está corriendo node bitunix-server.js?):', err.message);
  }
}

testBitunix();
