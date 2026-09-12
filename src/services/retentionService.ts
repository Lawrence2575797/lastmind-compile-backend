import { supabaseAdmin } from './supabaseAdmin';

// The one real, persisted "security/rate-limiting log" table this codebase
// has (see rateLimiters.ts's own per-minute counters, which are in-memory
// only and never touch the database at all - nothing to purge there).
// fresh_generation_events is a timestamp-only anti-abuse signal
// (generationCapService.ts), never read further back than one calendar
// month by any cap check, so purging anything past 90 days is always safe
// - matches the privacy policy's own stated "up to 90 days" retention for
// this category, closing the gap between what the policy says and what
// the code actually does.
export const FRESH_GENERATION_EVENTS_RETENTION_DAYS = 90;

export async function purgeOldFreshGenerationEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - FRESH_GENERATION_EVENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabaseAdmin
    .from('fresh_generation_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  if (error) throw error;
  return count ?? 0;
}

// No cron infrastructure exists anywhere in this codebase (see the
// comments this same audit found in locks.ts/lockService.ts/
// peerTutoringMatchService.ts) - rather than introduce a whole new piece
// of infra (a Render Cron Job, an external scheduler) for one small
// table, this runs as a simple in-process timer for as long as the
// backend is up. Once daily is far more often than actually needed for a
// 90-day retention window - the exact cadence doesn't matter, only that
// it eventually runs. A failed sweep is logged, never thrown - a purge
// job must never be allowed to crash the whole backend process.
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startRetentionScheduler(): void {
  const runSweep = async () => {
    try {
      const deleted = await purgeOldFreshGenerationEvents();
      if (deleted > 0) console.log(`LastMind: retention sweep purged ${deleted} fresh_generation_events row(s) older than ${FRESH_GENERATION_EVENTS_RETENTION_DAYS} days.`);
    } catch (err) {
      console.error('LastMind: retention sweep failed (non-fatal, will retry on the next scheduled run).', err);
    }
  };
  runSweep();
  setInterval(runSweep, PURGE_INTERVAL_MS);
}
