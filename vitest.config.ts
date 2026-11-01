import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so tests don't start the Electron dev plugin
export default defineConfig({
  test: {
    include: ['electron/**/*.test.ts'],
    environment: 'node',
    // The auth tests run real scrypt and the pipeline/trash tests real SQLite; under CPU load a few
    // took just over the 5 s default
    testTimeout: 15_000,
  },
});
