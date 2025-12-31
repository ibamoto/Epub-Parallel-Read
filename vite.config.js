import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'src-electron/main.cjs',
      },
      preload: {
        input: 'src-electron/preload.cjs',
      },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'foliate-js/view.js'],
  },
})
