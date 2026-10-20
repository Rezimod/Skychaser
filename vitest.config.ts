import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'apps/**'],
    // Sky arithmetic is genuinely slow — a routing test builds five nights of
    // slots and runs the safety envelope over each. The default 5s starves
    // them once the whole suite shares a worker, and fails on a CI runner
    // before it fails here.
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
