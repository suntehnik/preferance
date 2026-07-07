import { defineConfig } from 'vitest/config';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: true
  },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
    globals: true
  }
});
