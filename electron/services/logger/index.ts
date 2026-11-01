import fs from 'fs';
import path from 'path';

// Mirrors to the console and, once initLogger() has run, appends to <dir>/faber.log.
// The file rotates at MAX_BYTES into faber.1.log … faber.<KEEP>.log.
// Never pass secrets, passwords or recovery codes to these functions.

const MAX_BYTES = 1024 * 1024;
const KEEP = 5;

let logFile: string | null = null;

export function initLogger(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  logFile = path.join(dir, 'faber.log');
}

export function logsDir(): string | null {
  return logFile ? path.dirname(logFile) : null;
}

function rotate(file: string) {
  for (let i = KEEP - 1; i >= 1; i--) {
    const from = `${file.slice(0, -4)}.${i}.log`;
    if (fs.existsSync(from)) fs.renameSync(from, `${file.slice(0, -4)}.${i + 1}.log`);
  }
  fs.renameSync(file, `${file.slice(0, -4)}.1.log`);
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string) {
  const line = `${new Date().toISOString()} ${level} ${message}`;
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);

  if (!logFile) return;
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_BYTES) rotate(logFile);
    fs.appendFileSync(logFile, line + '\n');
  } catch {
    // Logging must never break the app
  }
}

export const log = {
  info: (message: string) => write('INFO', message),
  warn: (message: string) => write('WARN', message),
  error: (message: string) => write('ERROR', message),
};
