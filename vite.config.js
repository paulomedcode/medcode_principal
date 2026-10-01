import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// No `npm run dev` não existe a Vercel: este plugin atende /api/proposta-pdf
// com a mesma função que roda lá (api/proposta-pdf.js), usando o Chrome do computador.
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), 'VITE_'))
      server.middlewares.use('/api/proposta-pdf', async (req, res) => {
        const { default: handler } = await server.ssrLoadModule('/api/proposta-pdf.js')
        await handler(req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    apiLocal(),
  ],
  build: {
    sourcemap: false, // Oculta o código fonte original no F12
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove todos os console.log em produção
        drop_debugger: true
      }
    }
  }
})
