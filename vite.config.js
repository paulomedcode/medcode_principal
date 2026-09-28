import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
