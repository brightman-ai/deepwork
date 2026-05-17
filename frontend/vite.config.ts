import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // @ce self-alias: CE shell files use @ce/ internally so consumers can
      // set their own @ce → CE shell src without path collisions.
      '@ce': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 9000,
    host: true,
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  esbuild: {
    logLevel: 'silent'
  }
})
