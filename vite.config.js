import { defineConfig } from 'vite';
import { resolve } from 'path';

const isRootHost = process.env.VERCEL === '1' || process.env.CF_PAGES === '1' || Boolean(process.env.CF_PAGES_URL) || process.env.GITHUB_ACTIONS !== 'true';

export default defineConfig({
  base: isRootHost ? '/' : '/INDIEPLAYX/',
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
