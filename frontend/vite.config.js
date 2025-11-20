import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloudflared tunnel hostname configuration
// TWO OPTIONS:
// 1. Temporary tunnel (development): Copy URL from cloudflared output and paste here
//    Example: 'random-words-example.trycloudflare.com'
// 2. Permanent tunnel (production/demo): Use your permanent domain from .env
//    Example: 'app.yourdomain.com'
//
// For permanent tunnels: Set VITE_TUNNEL_HOST environment variable instead of hardcoding
const TUNNEL_HOST = import.meta.env.VITE_TUNNEL_HOST || ''

// https://vite.dev/config/
export default defineConfig ({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Only configure tunnel if TUNNEL_HOST is set
    ...(TUNNEL_HOST && {
      allowedHosts: [TUNNEL_HOST],
      hmr: { host: TUNNEL_HOST, protocol: 'wss', clientPort: 443 },
    }),
  },
})
