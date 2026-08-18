import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      // Consume the published package from its source, so the app and the
      // npm build never drift and there is no build-order dependency.
      'neiro-visualizer': fileURLToPath(
        new URL('./packages/neiro-visualizer/src/index.ts', import.meta.url),
      ),
    },
  },
})
