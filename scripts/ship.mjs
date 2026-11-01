// Builds the installer and installs it over the app on this machine, silently, then relaunches.
// App data lives in %APPDATA%, never in the install folder, so reinstalling keeps it.
//
//   npm run ship:beta            → "Natri's Faber Beta" (own install, own data: natris-faber-beta)
//   npm run ship:beta -- --fresh-data
//                                → also replace the beta's data with a copy of the newest backup
//   npm run ship -- --yes        → your real Natri's Faber (only after "Phase N confirmed")
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDataDir, copyBackupInto, newestBackup } from './lib/backup-copy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const beta = args.includes('--beta');

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const channel = beta
  ? { name: `${pkg.name}-beta`, productName: "Natri's Faber Beta", appId: `${pkg.build.appId}.beta`, version: `${pkg.version}-beta.${stamp}`, out: 'release/beta' }
  : { name: pkg.name, productName: pkg.build.productName, appId: pkg.build.appId, version: pkg.version, out: 'release/stable' };
const exeName = `${channel.productName}.exe`;
const installDir = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', channel.name);
const dataDir = path.join(appDataDir(), channel.name);

const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const run = (cmd, cmdArgs, options = {}) => {
  const result = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) fail(`${path.basename(cmd)} ${cmdArgs.slice(0, 2).join(' ')} failed (exit ${result.status ?? result.error?.message})`);
};

if (!beta && !args.includes('--yes')) {
  fail([
    "This updates your real Natri's Faber. Its database is migrated on the next start (backed up first).",
    'Only do this after the phase is confirmed. To go ahead: npm run ship -- --yes',
  ].join('\n  '));
}

console.log(`→ Shipping ${channel.productName} ${channel.version}`);

// 1. Beta data: a copy of the newest backup of your real data (first time, or --fresh-data)
if (beta) {
  const hasData = fs.existsSync(path.join(dataDir, 'faber.db'));
  if (!hasData || args.includes('--fresh-data')) {
    const backup = newestBackup();
    copyBackupInto(backup, dataDir);
    console.log(`→ Beta data copied from ${path.basename(backup)}`);
  } else {
    console.log('→ Keeping the beta\'s existing data (add --fresh-data to replace it)');
  }
}

// 2. Build the renderer/main bundles and the installer
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// npm sets npm_execpath when this runs as an npm script; otherwise go through the shell
if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, 'run', 'build'], { env });
else run('npm run build', [], { env, shell: true });
fs.rmSync(path.join(root, channel.out), { recursive: true, force: true });
run(process.execPath, [
  path.join(root, 'node_modules', 'electron-builder', 'cli.js'), 'build', '--win', '--publish', 'never',
  `-c.directories.output=${channel.out}`,
  `-c.appId=${channel.appId}`,
  `-c.productName=${channel.productName}`,
  `-c.extraMetadata.name=${channel.name}`,
  `-c.extraMetadata.version=${channel.version}`,
], { env });
const setup = fs.readdirSync(path.join(root, channel.out)).find((f) => f.endsWith('.exe'));
if (!setup) fail(`No installer found in ${channel.out}`);

// 3. Close the running app gracefully (it finishes its writes); never force-kill
const running = () => spawnSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH'], { encoding: 'utf8' }).stdout.includes(exeName);
if (running()) {
  console.log(`→ Closing ${channel.productName}…`);
  spawnSync('taskkill', ['/IM', exeName], { stdio: 'ignore' });
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 30 && running(); i++) Atomics.wait(pause, 0, 0, 500);
  if (running()) fail(`${channel.productName} is still open. Close it (and any dialogs) and run this again.`);
}

// 4. Silent install over the existing one, then relaunch
console.log(`→ Installing ${setup}`);
run(path.join(root, channel.out, setup), ['/S']);
const exe = path.join(installDir, exeName);
if (fs.existsSync(exe)) {
  spawn(exe, [], { env, detached: true, stdio: 'ignore' }).unref();
  console.log(`✓ ${channel.productName} ${channel.version} installed and started`);
} else {
  console.log(`✓ Installed. Start "${channel.productName}" from the Start menu (expected at ${exe}).`);
}
console.log(`  Data: ${dataDir}`);
