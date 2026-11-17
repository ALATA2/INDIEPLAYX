import { defineConfig } from 'vite';
import { resolve } from 'path';

const isRootHost = process.env.VERCEL === '1' || process.env.CF_PAGES === '1' || Boolean(process.env.CF_PAGES_URL) || process.env.GITHUB_ACTIONS !== 'true';

export default defineConfig({
  base: isRootHost ? '/' : '/INDIEPLAYX/',
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
        account: resolve(__dirname, 'account.html'),
        showcase: resolve(__dirname, 'showcase.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            if (id.includes('firestore')) return 'firebase-firestore';
            if (id.includes('auth')) return 'firebase-auth';
            if (id.includes('storage')) return 'firebase-storage';
            return 'firebase-core';
          }
        },
      },
    },
  },
});
