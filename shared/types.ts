// Row and view types shared by the main process and the renderer.
// Field names match the SQLite columns.
import type { LeadStatus, LostReason } from './pipeline.ts';

export type { LeadStatus, LostReason } from './pipeline.ts';
export type ProjectStage = 'ongoing' | 'maintenance' | 'completed';
export type PaymentType = 'advance' | 'milestone' | 'final';
export type PaymentStatus = 'pending' | 'received';
export type EntityType = 'lead' | 'project';
// blocklist: name matched a pattern; not_a_fit: marked by hand; cleared: unflagged by hand
export type ChainReason = 'blocklist' | 'not_a_fit' | 'cleared';

export interface ChainPattern {
  id: number;
  pattern: string;
  source: 'seed' | 'manual';
  created_at: string;
  // flagged leads this pattern currently matches
  matches: number;
}

export const CATEGORIES = [
  'Restaurants',
  'Cafes',
  'Salons',
  'Gyms',
  'Clinics',
  'Boutiques',
  'Coaching Centres',
  'Hotels',
] as const;

export interface Lead {
  id: number;
  osm_id: string | null;
  name: string;
  category: string | null;
  source: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  rating: number | null;
  review_count: number | null;
  social_links: string | null;
  has_phone: number;
  has_social: number;
  enrichment_status: string;
  score: number | null;
  status: LeadStatus;
  notes: string | null;
  scope: string | null;
  discovered_at: string;
  enriched_at: string | null;
  last_updated: string;
  is_chain: number;
  chain_reason: ChainReason | null;
  // Parsed from the JSON column
  tags: string[];
  starred: number;
  lost_reason: LostReason | null;
  owner_name: string | null;
  best_time: string | null;
  last_contacted_at: string | null;
  website_url: string | null;
  website_status: WebsiteStatus;
}

export type WebsiteStatus = 'none' | 'found' | 'unknown';
export type LeadSort = 'score' | 'name' | 'newest' | 'last_contacted';

// Codex filters; every one is applied in SQL (§8.1)
export interface LeadFilters {
  search: string;
  // Empty means the active stages (new … proposal)
  stages: LeadStatus[];
  category: string | null;
  city: string | null;
  // 0 and 100 are open ends; a narrower range leaves out unscored leads
  scoreMin: number;
  scoreMax: number;
  tags: string[];
  starredOnly: boolean;
  websiteStatus: WebsiteStatus | null;
  showChains: boolean;
  sort: LeadSort;
}

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  search: '',
  stages: [],
  category: null,
  city: null,
  scoreMin: 0,
  scoreMax: 100,
  tags: [],
  starredOnly: false,
  websiteStatus: null,
  showChains: false,
  sort: 'score',
};

export interface LeadFacets {
  cities: string[];
  tags: string[];
}

export type ActivityType = 'status_change' | 'contact_attempt' | 'visit' | 'note' | 'demo' | 'quote';
export type ActivityChannel = 'whatsapp' | 'call' | 'visit' | 'instagram' | 'email' | 'other';

export interface LeadActivity {
  id: number;
  lead_id: number;
  type: ActivityType;
  channel: ActivityChannel | null;
  outcome: string | null;
  body: string | null;
  created_at: string;
}

// Fields a person can type in for a manual lead or an edit
export interface LeadInput {
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  owner_name: string | null;
  best_time: string | null;
  website_url: string | null;
  notes: string | null;
}

export type BulkLeadAction =
  // Won stays one lead at a time: each one creates a project
  | { type: 'move'; to: Exclude<LeadStatus, 'won'>; lostReason?: LostReason; note?: string }
  | { type: 'tag'; tag: string; add: boolean }
  | { type: 'star'; starred: boolean }
  | { type: 'followUp'; dueDate: string; message: string }
  | { type: 'delete' }
  | { type: 'restore' };

export interface BulkResult {
  done: number;
  // Leads the action didn't apply to, and why (e.g. a move the pipeline doesn't allow)
  skipped: { id: number; name: string; reason: string }[];
}

export interface WorkLog {
  id: number;
  project_id: number;
  entry: string;
  logged_at: string;
}

export interface Project {
  id: number;
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  source: string | null;
  social_links: string | null;
  scope: string | null;
  stage: ProjectStage;
  payment_agreed: number | null;
  payment_received: number | null;
  deadline: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  last_updated: string;
}

export interface ProjectWithLog extends Project {
  workLog: WorkLog[];
}

export interface Payment {
  id: number;
  project_id: number;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  due_date: string | null;
  received_at: string | null;
  notes: string | null;
  project_name: string;
  project_category: string | null;
  project_stage: ProjectStage;
  payment_agreed: number | null;
  project_payment_received: number | null;
}

export interface ProjectForPayments {
  id: number;
  name: string;
  category: string | null;
  stage: ProjectStage;
  payment_agreed: number | null;
  payment_received: number | null;
}

export interface Reminder {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  message: string;
  due_date: string;
  is_done: number;
  created_at: string;
  entity_name: string | null;
}

export interface EntityOption {
  id: number;
  name: string;
}

export interface DashboardData {
  leadStats: { total: number; new_count: number; contacted_count: number; lost_count: number };
  projectCount: number;
  topLeads: { id: number; name: string; category: string | null; score: number | null; status: LeadStatus; city: string | null }[];
  upcomingReminders: Reminder[];
  revenueStats: { total_agreed: number; total_received: number };
  projectsByStage: { stage: ProjectStage; count: number }[];
  recentActivity: { entry: string; logged_at: string; project_name: string }[];
  projectPayments: { name: string; payment_agreed: number | null; payment_received: number | null }[];
}

export interface DiscoveryResult {
  found: number;
  saved: number;
  updated: number;
  errors: string[];
}

export interface RunLogState {
  running: boolean;
  logs: string[];
}

export interface DiscoveryState extends RunLogState {
  stats: { found: number; saved: number; updated: number };
  // For the Scrying mini-map: the search circle and each lead saved or updated this run
  center: { lat: number; lon: number; radiusKm: number } | null;
  points: { lat: number; lon: number }[];
}

export type EnrichmentStep = 'search' | 'rating' | 'social' | 'match';
export type EnrichmentOutcome = 'enriched' | 'review' | 'failed' | 'skipped';

export interface EnrichmentState extends RunLogState {
  captchaPending: boolean;
  processed: number;
  total: number;
  stats: { enriched: number; skipped: number };
  error: string | null;
  // For the enrichment panel: the lead in progress, its step, and the latest outcomes
  current: { id: number; name: string } | null;
  step: EnrichmentStep | null;
  recent: { lead_id: number; name: string; outcome: EnrichmentOutcome; at: string }[];
}

export interface EnrichmentComplete {
  enriched: number;
  skipped: number;
  error?: string;
}

export type SearchHitType = 'lead' | 'project' | 'reminder';

export interface SearchHit {
  type: SearchHitType;
  id: number;
  title: string;
  subtitle: string;
}

export type TrashType = 'lead' | 'project' | 'payment' | 'reminder';

export interface TrashItem {
  type: TrashType;
  id: number;
  title: string;
  subtitle: string;
  deleted_at: string;
  days_left: number;
}

export type NotificationKind = 'discovery' | 'enrichment' | 'backup' | 'system';

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
}

export interface BackupEntry {
  name: string;
  kind: string;
  created_at: string;
  size_bytes: number;
}

export interface BackupOverview {
  folder: string;
  is_default_folder: boolean;
  keep: number;
  backups: BackupEntry[];
}

export interface RestoreCandidate {
  file: string;
  schema_version: number;
  counts: Record<string, number>;
}

export type ExportEntity = 'leads' | 'projects' | 'payments' | 'reminders';

export interface AppInfo {
  version: string;
  is_dev: boolean;
  user_data_path: string;
  logs_path: string;
}
