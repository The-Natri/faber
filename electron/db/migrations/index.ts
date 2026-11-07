import type { Migration } from '../migrate.ts';
import { baseline } from './001_baseline.ts';
import { interimAuthSettings } from './002_interim_auth_settings.ts';
import { authAndAppSettings } from './003_auth_and_app_settings.ts';
import { softDeleteAndIndexes } from './004_soft_delete_and_indexes.ts';
import { normalizeCities } from './005_normalize_cities.ts';
import { localityCities } from './006_locality_cities.ts';
import { chains } from './007_chains.ts';
import { flagChains } from './008_flag_chains.ts';
import { pipeline } from './009_pipeline.ts';
import { aiActivity } from './010_ai_activity.ts';
import { websiteCheck } from './011_website_check.ts';
import { websiteAudit } from './012_website_audit.ts';

// Listed explicitly (not read from disk) because main is bundled into one file.
// Append new migrations at the end; never edit or reorder ones that have shipped.
export const MIGRATIONS: Migration[] = [
  baseline,
  interimAuthSettings,
  authAndAppSettings,
  softDeleteAndIndexes,
  normalizeCities,
  localityCities,
  chains,
  flagChains,
  pipeline,
  aiActivity,
  websiteCheck,
  websiteAudit,
];
