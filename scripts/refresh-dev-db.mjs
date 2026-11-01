// Replaces the dev database with a copy of the newest backup of the installed app's database.
// Only reads the installed app's backups folder; never opens its live faber.db.
//
// Usage: npm run dev:refresh-db [-- <backup folder>]
import path from 'node:path';
import { appDataDir, copyBackupInto, newestBackup } from './lib/backup-copy.mjs';

try {
  const latest = newestBackup(process.argv[2] || undefined);
  const devDb = copyBackupInto(latest, path.join(appDataDir(), 'natris-faber-dev'));
  console.log(`Dev database refreshed from ${path.basename(latest)}`);
  console.log(`  → ${devDb}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
