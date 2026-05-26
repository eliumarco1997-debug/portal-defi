import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bitunix-api': {
        target: 'https://fapi.bitunix.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bitunix-api/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // Emulate standard API request to bypass Cloudflare
            proxyReq.setHeader('Origin', 'https://www.bitunix.com');
            proxyReq.setHeader('Referer', 'https://www.bitunix.com/');
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
          });
        }
      }
    }
  }
})
