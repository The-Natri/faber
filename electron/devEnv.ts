import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Dev-only secrets live outside the repo, in ../faber-private/.env next to the project folder,
// so nothing secret can be committed by accident. FABER_ENV_PATH points somewhere else.
// The packaged app never calls this; callers check app.isPackaged first.
export function devEnvPath(repoRoot: string, override = process.env.FABER_ENV_PATH): string {
  return override?.trim() ? path.resolve(override.trim()) : path.resolve(repoRoot, '..', 'faber-private', '.env');
}

// Parses the dev env file. A missing file is an error naming the expected path: no silent fallback
// to a .env in the project folder. Values are returned, not copied into process.env, except the
// names listed in `expose` (an existing process.env value wins). This keeps v1's USERNAME from
// clobbering the Windows USERNAME variable.
export function loadDevEnv(repoRoot: string, expose: readonly string[] = []): Record<string, string> {
  const file = devEnvPath(repoRoot);
  if (!fs.existsSync(file)) {
    throw new Error(`Dev env file not found at ${file}. Create it there, or set FABER_ENV_PATH to its location.`);
  }
  const values = dotenv.parse(fs.readFileSync(file));
  for (const name of expose) {
    if (values[name] !== undefined && process.env[name] === undefined) process.env[name] = values[name];
  }
  return values;
}
