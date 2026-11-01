// better-sqlite3 is compiled for Electron's Node ABI, so Vitest runs inside Electron acting as Node.
// Usage: npm test [-- <vitest args>]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const vitestEntry = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
const args = process.argv.slice(2);

const child = spawn(electronPath, [vitestEntry, ...(args.length ? args : ['run'])], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
child.on('exit', (code) => process.exit(code ?? 1));
