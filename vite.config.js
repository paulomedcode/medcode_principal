import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// No `npm run dev` não existe a Vercel: este plugin atende /api/* com as
// mesmas funções que rodam lá (pasta api/). As chaves do servidor (Google,
// chave de serviço do Supabase) vêm do .env.local, que não vai para o git —
// e só entram no process.env do servidor, nunca no navegador (que só vê VITE_).
function apiLocal() {
  return {
    name: 'api-local',
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''))
      for (const nome of ['proposta-pdf', 'google']) {
        server.middlewares.use(`/api/${nome}`, async (req, res) => {
          const { default: handler } = await server.ssrLoadModule(`/api/${nome}.js`)
          await handler(req, res)
        })
      }
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
