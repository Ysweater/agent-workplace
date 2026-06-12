import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Agent run may include npm install + Vite boot (often > 60s)
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
});
