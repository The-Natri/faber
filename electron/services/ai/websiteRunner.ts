import type Database from 'better-sqlite3';
import { AppError } from '../../ipc/core.ts';
import type { WebsiteCheckResult, WebsiteCheckState } from '../../../shared/ai.ts';
import { log } from '../logger/index.ts';
import { checkWebsite, fetchPage, nextUncheckedLeads, type PageFetcher, type WebsiteCheckGateway } from './websiteCheck.ts';

const RECENT_MAX = 50;
// Failures no next lead can fix
const STOPS_BATCH = new Set(['budget', 'not_configured', 'auth']);

export interface WebsiteRunnerOptions {
  onState: (state: WebsiteCheckState) => void;
  // Read at the start of each batch, so a change in Arcana applies to the next one
  delayMs: () => number;
  fetcher?: PageFetcher;
  sleep?: (ms: number) => Promise<void>;
}

// Small website-check batches in the background, one lead at a time with a pause between them.
// Paid calls are never retried; a spend-limit refusal ends the batch.
export class WebsiteCheckRunner {
  private state: WebsiteCheckState = { running: false, processed: 0, total: 0, current: null, results: [], costUsd: 0, error: null };
  private stopRequested = false;

  constructor(
    private readonly getDb: () => Database.Database,
    private readonly gateway: WebsiteCheckGateway,
    private readonly options: WebsiteRunnerOptions,
  ) {}

  getState(): WebsiteCheckState {
    return this.state;
  }

  private setState(patch: Partial<WebsiteCheckState>) {
    this.state = { ...this.state, ...patch };
    this.options.onState(this.state);
  }

  stop() {
    this.stopRequested = true;
  }

  // One lead, outside any batch (the button in a lead's details)
  checkOne(leadId: number): Promise<WebsiteCheckResult> {
    return checkWebsite(this.getDb(), this.gateway, leadId, this.options.fetcher ?? fetchPage);
  }

  // Starts a batch and returns at once; progress arrives through onState. The returned promise is
  // the batch itself, for tests.
  start(request: { count: number } | { leadIds: number[] }): Promise<void> {
    if (this.state.running) throw new AppError('CONFLICT', 'A website check is already running');
    const db = this.getDb();
    const leads = 'leadIds' in request
      ? request.leadIds.flatMap((id) => {
        const row = db.prepare('SELECT id, name FROM leads WHERE id = ? AND deleted_at IS NULL').get(id) as { id: number; name: string } | undefined;
        return row ? [row] : [];
      })
      : nextUncheckedLeads(db, request.count);
    this.stopRequested = false;
    this.setState({ running: true, processed: 0, total: leads.length, current: null, costUsd: 0, error: null });
    return this.run(leads);
  }

  private async run(leads: { id: number; name: string }[]) {
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const delay = this.options.delayMs();
    try {
      for (const [index, lead] of leads.entries()) {
        if (this.stopRequested) break;
        if (index > 0 && delay > 0) await sleep(delay);
        if (this.stopRequested) break;
        this.setState({ current: lead });
        const result = await this.checkOne(lead.id).catch((error: unknown): WebsiteCheckResult => ({
          leadId: lead.id, name: lead.name, verdict: 'unknown', evidenceUrl: null, reason: '', path: 'search', screen: 'unscreened',
          servedModel: null, provider: null, fallback: false, costUsd: 0, error: error instanceof Error ? error.message : String(error), errorKind: null,
        }));
        this.setState({
          processed: this.state.processed + 1,
          results: [result, ...this.state.results].slice(0, RECENT_MAX),
          costUsd: Number((this.state.costUsd + result.costUsd).toFixed(6)),
        });
        if (result.errorKind && STOPS_BATCH.has(result.errorKind)) {
          this.setState({ error: result.error });
          break;
        }
      }
    } catch (error) {
      log.error(`[Website check] Batch stopped: ${error instanceof Error ? error.message : String(error)}`);
      this.setState({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.setState({ running: false, current: null });
    }
  }
}
