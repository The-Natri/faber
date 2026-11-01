import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  { ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat.recommended],
  },
]);
