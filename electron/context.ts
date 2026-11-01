import type Database from 'better-sqlite3';
import type { BrowserWindow } from 'electron';
import type { AuthService } from './services/auth/index.ts';
import type { SettingsService } from './services/settings/index.ts';
import type { NotificationCenter } from './services/notifications/index.ts';
import type { DiscoveryRunner } from './services/discovery/index.ts';
import type { EnrichmentRunner } from './services/enrichment/index.ts';
import type { OtariGateway } from './services/ai/gateway.ts';
import type { WebsiteCheckRunner } from './services/ai/websiteRunner.ts';

// Everything the IPC handlers need, created once in main.ts
export interface AppContext {
  db: () => Database.Database;
  dbPath: string;
  userDataPath: string;
  defaultBackupDir: string;
  backupDir: () => string;
  auth: AuthService;
  settings: SettingsService;
  notifications: NotificationCenter;
  discovery: DiscoveryRunner;
  enrichment: EnrichmentRunner;
  ai: OtariGateway;
  websiteChecks: WebsiteCheckRunner;
  window: () => BrowserWindow | null;
  relaunch: () => void;
}
