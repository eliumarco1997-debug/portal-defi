const https = require('https');

const options = {
  hostname: 'fapi.bitunix.com',
  path: '/api/v1/futures/market/ping', // Or any public endpoint
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.end();
