import path from 'path';
import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron';
import { databasePath, getDB, initDB } from './db/index.ts';
import { initLogger, log } from './services/logger/index.ts';
import { AuthService } from './services/auth/index.ts';
import { SettingsService, type SecretBox } from './services/settings/index.ts';
import { NotificationCenter } from './services/notifications/index.ts';
import { DiscoveryRunner } from './services/discovery/index.ts';
import { EnrichmentRunner } from './services/enrichment/index.ts';
import { OtariGateway } from './services/ai/gateway.ts';
import { startAutoBackup } from './services/backup/index.ts';
import { purgeExpired } from './services/trash/index.ts';
import { createHandlers, registerIpc } from './ipc/index.ts';
import { emit, setEventTarget } from './ipc/events.ts';
import type { AppContext } from './context.ts';
import { loadDevEnv } from './devEnv.ts';

// Dev runs get their own data folder so they can never touch the installed app's database
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'natris-faber-dev'));
}

// One instance at a time: two processes writing the same database would fight over it
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Beta installs (npm run ship:beta) are named natris-faber-beta, so their data lives apart
const IS_BETA = app.isPackaged && app.getName().endsWith('-beta');
const WINDOW_TITLE = IS_BETA ? "Natri's Faber Beta" : "Natri's Faber";

const DAY_MS = 24 * 60 * 60 * 1000;
let mainWindow: BrowserWindow | null = null;

function isAppUrl(url: string): boolean {
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  return devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0A0F1F',
    title: WINDOW_TITLE,
    // Packaged builds take the window and taskbar icon from the exe (electron-builder win.icon);
    // dev runs are electron.exe, so they point at the brand icon directly
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../assets/brand/faber-logo/icon.ico') }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links leave the app for the system browser; the window itself never navigates away
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  // Keep "Beta" in the taskbar title instead of the page's <title>
  mainWindow.on('page-title-updated', (event) => { if (IS_BETA) event.preventDefault(); });
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// v1 kept its login in .env. It is read once, only when no login exists yet, and never again.
// Installers no longer ship .env, so only dev runs can still import from it (see devEnv.ts).
function readEnvCredentials(values: Record<string, string>): { username?: string; password?: string } {
  return { username: values.USERNAME, password: values.PASSWORD };
}

const safeStorageBox: SecretBox = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
  decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
};

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  initLogger(path.join(userDataPath, 'logs'));
  log.info(`[App] Starting Natri's Faber ${app.getVersion()}${app.isPackaged ? '' : ' (dev)'}`);
  const defaultBackupDir = path.join(userDataPath, 'backups');

  // 1. Database and migrations. A failed migration has been rolled back; starting on the old
  //    schema could corrupt data, so stop here.
  try {
    await initDB(defaultBackupDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`[DB] Startup failed: ${message}`);
    dialog.showErrorBox("Natri's Faber couldn't open its database",
      `${message}\n\nYour data has not been changed. Backups are in:\n${defaultBackupDir}`);
    app.quit();
    return;
  }

  // 2. Services
  const settings = new SettingsService(getDB(), safeStorageBox);
  const backupDir = () => settings.get('backups').folder ?? defaultBackupDir;
  const auth = new AuthService(getDB());
  let devEnv: Record<string, string> = {};
  if (!app.isPackaged) {
    try {
      devEnv = loadDevEnv(path.join(__dirname, '..'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[Env] ${message}`);
      dialog.showErrorBox("Natri's Faber (dev) couldn't load its env file", message);
      app.quit();
      return;
    }
  }
  const env = readEnvCredentials(devEnv);
  if (await auth.importFromEnv(env.username, env.password)) {
    log.info('[Auth] Imported the v1 login from .env; a new password is required at first sign-in');
  }

  const notifications = new NotificationCenter((n) => emit('notifications:new', n));
  const discovery = new DiscoveryRunner(getDB, {
    onLog: (line) => emit('discover:log', line),
    onState: (state) => emit('discover:state', state),
    onFinished: (result) => {
      const body = `${result.saved} new, ${result.updated} updated${result.errors.length ? ` · ${result.errors.length} error(s)` : ''}`;
      notifications.push('discovery', result.errors.length && !result.found ? 'Discovery failed' : 'Discovery finished', body);
    },
  });
  const enrichment = new EnrichmentRunner(getDB, {
    onLog: (line) => emit('enrichment:log', line),
    onCaptcha: (leadName) => {
      emit('enrichment:captcha');
      notifications.push('enrichment', 'Enrichment paused on a CAPTCHA', `Waiting on ${leadName}. Retry or skip in Codex.`);
    },
    onState: (state) => emit('enrichment:state', state),
    onComplete: (result) => {
      emit('enrichment:complete', result);
      if (result.error) notifications.push('enrichment', 'Enrichment stopped', result.error);
    },
  });

  // AI through Otari. The key saved in Arcana wins; dev runs fall back to OTARI_API_KEY from the dev
  // env file, so the packaged app (and Beta, with its own key) only ever uses what was saved there.
  const ai = new OtariGateway(getDB, () => {
    const integrations = settings.get('integrations');
    const saved = settings.getSecret('otariApiKey');
    const devKey = devEnv.OTARI_API_KEY?.trim() || null;
    return {
      apiKey: saved ?? devKey,
      keySource: saved ? 'settings' : devKey ? 'dev_env' : 'none',
      baseUrl: integrations.otariBaseUrl,
      models: { verify: integrations.modelVerify, pitch: integrations.modelPitch, screener: integrations.modelScreener },
    };
  });

  const ctx: AppContext = {
    db: getDB,
    dbPath: databasePath(),
    userDataPath,
    defaultBackupDir,
    backupDir,
    auth,
    settings,
    notifications,
    discovery,
    enrichment,
    ai,
    window: () => mainWindow,
    relaunch: () => {
      app.relaunch();
      app.exit(0);
    },
  };

  // 3. Background jobs: rotated daily backups, and the 30-day trash purge
  const stopAutoBackup = startAutoBackup(getDB, backupDir, {
    getKeep: () => settings.get('backups').keep,
    log: (msg) => log.info(`[Backup] ${msg}`),
    onError: (message) => notifications.push('backup', 'Backup failed', message),
  });
  const purge = () => {
    const purged = purgeExpired(getDB());
    if (purged) log.info(`[Trash] Purged ${purged} item(s) older than 30 days`);
  };
  purge();
  const purgeTimer = setInterval(purge, DAY_MS);
  app.on('before-quit', () => {
    stopAutoBackup();
    clearInterval(purgeTimer);
    auth.lock();
  });

  // 4. IPC and window
  setEventTarget(() => mainWindow);
  registerIpc(ctx, createHandlers(ctx));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
