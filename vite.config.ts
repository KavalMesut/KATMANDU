import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { solutionApiPlugin } from './server/solutionApiPlugin';
import { PRIVATE_FILE_DENY_LIST, publicationSafetyPlugin } from './server/publicationSafety';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    publicationSafetyPlugin(),
    solutionApiPlugin(),
    tailwindcss(),
    react()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/katex/')) return 'math';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
        }
      }
    }
  },
  preview: { host: process.env.KATMANDU_SHARE_NETWORK === '1' ? '0.0.0.0' : '127.0.0.1' },
  server: {
    fs: { deny: PRIVATE_FILE_DENY_LIST },
    port: 5173,
    host: process.env.KATMANDU_SHARE_NETWORK === '1' ? '0.0.0.0' : '127.0.0.1'
  }
});
