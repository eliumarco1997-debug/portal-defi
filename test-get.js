import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.BITUNIX_API_KEY || '2fd32cfddbb26366c5f90d709b914b81';
const API_SECRET = process.env.BITUNIX_API_SECRET || 'ffa77a2fa9b6fa30664e8cf110501fb5';

async function testBitunixGet() {
  const endpoint = '/api/v1/futures/account';
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  const digestInput = nonce + timestamp + API_KEY;
  const digest = crypto.createHash('sha256').update(digestInput).digest('hex');
  const signature = crypto.createHash('sha256').update(digest + API_SECRET).digest('hex');

  const response = await fetch(`http://localhost:3001/bitunix-api${endpoint}`, {
    method: 'GET',
    headers: {
      'api-key': API_KEY,
      'timestamp': timestamp,
      'nonce': nonce,
      'sign': signature
    }
  });

  console.log(await response.text());
}
testBitunixGet();
