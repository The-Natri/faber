import { z } from 'zod';
import { DEFAULT_MODELS, OTARI_EU_BASE_URL } from './ai.ts';

// Each section is stored as one JSON value in app_settings under its section name.
// Every field has a default, so a missing or partial section always parses.

const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const profileSchema = z.object({
  yourName: z.string().trim().max(100).default(''),
  businessName: z.string().trim().max(100).default("Natri's Faber"),
  phone: z.string().trim().max(30).default(''),
  email: z.union([z.literal(''), z.email()]).default(''),
  upiId: z.string().trim().refine((v) => v === '' || UPI_ID.test(v), 'UPI ID should look like name@bank').default(''),
  address: z.string().trim().max(300).default(''),
  gstRegistered: z.boolean().default(false),
  gstin: z.string().trim().toUpperCase().refine((v) => v === '' || GSTIN.test(v), 'GSTIN should be 15 characters, like 33ABCDE1234F1Z5').default(''),
  gstState: z.string().trim().max(60).default(''),
  invoicePrefix: z.string().trim().min(1).max(10).default('INV'),
  quotePrefix: z.string().trim().min(1).max(10).default('Q'),
}).refine((p) => !p.gstRegistered || p.gstin !== '', { message: 'GSTIN is required when GST registered is on', path: ['gstin'] });

export const securitySchema = z.object({
  // 0 turns auto-lock off
  autoLockMinutes: z.number().int().min(0).max(240).default(15),
});

export const themeSchema = z.enum(['nocturne', 'parchment']);

export const appearanceSchema = z.object({
  theme: themeSchema.default('nocturne'),
  reduceMotion: z.boolean().default(false),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  sidebarCollapsed: z.boolean().default(false),
  // Synthesized sound effects (unlock, seal, letter, anvil, payment); off by default
  soundEnabled: z.boolean().default(false),
  soundVolume: z.number().int().min(0).max(100).default(60),
  // Recording mode: hides phone numbers, owner names and your own contact details on screen (Ctrl+Shift+H).
  // Display only; nothing stored changes.
  recordingMode: z.boolean().default(false),
});

export const homeBaseSchema = z.object({
  label: z.string().trim().max(200).default(''),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lon: z.number().min(-180).max(180).nullable().default(null),
});

export const discoveryDefaultsSchema = z.object({
  location: z.string().trim().max(200).default('Anna Nagar, Chennai'),
  radiusKm: z.number().int().min(1).max(50).default(5),
  categories: z.array(z.string()).default(['Cafes']),
  autoEnrich: z.boolean().default(false),
});

export const outreachSchema = z.object({
  followUpDays: z.array(z.number().int().min(1).max(90)).min(1).max(5).default([3, 7, 14]),
  dailyGoal: z.number().int().min(1).max(100).default(10),
  defaultLanguage: z.enum(['en', 'ta']).default('en'),
  // What you offer, in your words: the only description of your service a pitch draft may use, so
  // there is no default. It goes to the pitch model, so keep personal details out; Faber adds your
  // name and number after the draft is written.
  pitchOffer: z.string().trim().max(400).default(''),
});

// AI goes through the Otari gateway (shared/ai.ts). Each model field names a routing policy or a
// catalog id, all open-weight.
const modelName = (fallback: string) => z.string().trim().min(1).max(120).default(fallback);

export const integrationsSchema = z.object({
  otariBaseUrl: z.url({ protocol: /^https$/, message: 'The Otari base URL should start with https://' }).default(OTARI_EU_BASE_URL),
  modelVerify: modelName(DEFAULT_MODELS.verify),
  modelPitch: modelName(DEFAULT_MODELS.pitch),
  modelScreener: modelName(DEFAULT_MODELS.screener),
  // Website check batches: each lead costs about $0.011 (one web search plus small model calls)
  websiteBatchSize: z.number().int().min(1).max(20).default(5),
  websiteDelaySeconds: z.number().int().min(0).max(60).default(3),
  // Faber's own monthly AI spending cap in USD, checked before every paid call; 0 pauses AI entirely.
  // Separate from (and on top of) any ceiling or budget set in the Otari dashboard.
  monthlyCapUsd: z.number().min(0).max(1000).default(5),
  telegramChatId: z.string().trim().max(40).default(''),
});

export const backupsSchema = z.object({
  // null means the default folder (userData/backups)
  folder: z.string().nullable().default(null),
  keep: z.number().int().min(1).max(365).default(14),
});

export const SETTINGS_SCHEMAS = {
  profile: profileSchema,
  security: securitySchema,
  appearance: appearanceSchema,
  homeBase: homeBaseSchema,
  discovery: discoveryDefaultsSchema,
  outreach: outreachSchema,
  integrations: integrationsSchema,
  backups: backupsSchema,
} as const;

export type SettingsSection = keyof typeof SETTINGS_SCHEMAS;
export const SETTINGS_SECTIONS = Object.keys(SETTINGS_SCHEMAS) as SettingsSection[];

export type AppSettings = { [K in SettingsSection]: z.output<(typeof SETTINGS_SCHEMAS)[K]> };
export type Appearance = AppSettings['appearance'];
export type ThemeName = z.output<typeof themeSchema>;

export const SECRET_NAMES = ['otariApiKey', 'telegramBotToken'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

// What the renderer sees for a stored secret: never the value itself
export interface MaskedSecret {
  set: boolean;
  masked: string;
}

export interface SettingsView {
  settings: AppSettings;
  secrets: Record<SecretName, MaskedSecret>;
  secretStorageAvailable: boolean;
}
