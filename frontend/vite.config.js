import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// cloudflared tunnel for toDateString();
const TUNNEL_HOST = 'https://eva-cayman-wright-watt.trycloudflare.com'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 0.0.0.0,
    port: 5173,
    allowedHosts: [TUNNEL_HOST],

    // Help HMR work over HTTPS tunnel
    hmr: {
      host: TUNNEL_HOST,
      protocol: 'wss',
      clientPort: 443,
    },
  },
})
