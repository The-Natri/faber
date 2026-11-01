import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't start the Electron dev plugin
export default defineConfig({
  test: {
    include: ['electron/**/*.test.ts'],
    environment: 'node',
  },
});
