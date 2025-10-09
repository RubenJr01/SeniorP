import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// cloudflared tunnel for toDateString();
const TUNNEL_HOST = 'eva-cayman-wright-watt.trycloudflare.com'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [TUNNEL_HOST],
    hmr: { host: TUNNEL_HOST, protocol: 'wss', clientPort: 443 },
  },
})
