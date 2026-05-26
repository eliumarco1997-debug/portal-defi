import http from 'http';
import https from 'https';

const PORT = 3001;

const server = http.createServer((req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api-key, sign, timestamp, nonce');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith('/bitunix-api')) {
    const targetPath = req.url.replace('/bitunix-api', '');
    
    // Configurar la petición a Bitunix
    const options = {
      hostname: 'fapi.bitunix.com',
      path: targetPath,
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        // Pasar solo los headers esenciales de la API
        ...(req.headers['api-key'] && { 'api-key': req.headers['api-key'] }),
        ...(req.headers['sign'] && { 'sign': req.headers['sign'] }),
        ...(req.headers['timestamp'] && { 'timestamp': req.headers['timestamp'] }),
        ...(req.headers['nonce'] && { 'nonce': req.headers['nonce'] }),
        // Forzar un User-Agent limpio para evitar Cloudflare WAF
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Eliminar posibles headers problemáticos de la respuesta si es necesario
      res.writeHead(proxyRes.statusCode, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': proxyRes.headers['content-type'] || 'application/json'
      });
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (e) => {
      console.error(`Error en proxy: ${e.message}`);
      res.writeHead(500);
      res.end(`Proxy Error: ${e.message}`);
    });

    req.pipe(proxyReq, { end: true });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Bitunix Proxy Server corriendo en http://localhost:${PORT}`);
  console.log('Todas las peticiones a /bitunix-api serán redirigidas a https://fapi.bitunix.com');
});
