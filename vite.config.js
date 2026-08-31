import { defineConfig } from 'vite';
import { resolve } from 'path';

const isVercel = process.env.VERCEL === '1';

export default defineConfig({
  base: isVercel ? '/' : '/INDIEPLAYX/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'game.html'),
        account: resolve(__dirname, 'account.html'),
        showcase: resolve(__dirname, 'showcase.html'),
      },
    },
  },
});
