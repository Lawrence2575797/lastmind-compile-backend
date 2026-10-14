import crypto from 'crypto';
import type { IncrementResponse, Options, Store } from 'express-rate-limit';
import { supabaseAdmin } from './supabaseAdmin';

// Shared fixed-window counters. Supabase lets every Render instance see the
// same count. Until the accompanying migration is applied, requests still use
// a small local fallback instead of taking the whole service offline.
export class SupabaseRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly local = new Map<string, { hits: number; resetTime: Date }>();
  readonly localKeys = false;

  constructor(private readonly namespace: string) {}

  init(options: Options): void { this.windowMs = options.windowMs; }

  private digest(key: string): string {
    return crypto.createHash('sha256').update(`${this.namespace}:${key}`).digest('hex');
  }

  private localIncrement(key: string): IncrementResponse {
    const now = Date.now();
    let row = this.local.get(key);
    if (!row || row.resetTime.getTime() <= now) {
      row = { hits: 0, resetTime: new Date(now + this.windowMs) };
      this.local.set(key, row);
    }
    row.hits += 1;
    return { totalHits: row.hits, resetTime: row.resetTime };
  }

  async increment(key: string): Promise<IncrementResponse> {
    const { data, error } = await supabaseAdmin.rpc('rate_limit_increment', {
      p_namespace: this.namespace,
      p_key_hash: this.digest(key),
      p_window_seconds: Math.max(1, Math.ceil(this.windowMs / 1000)),
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return this.localIncrement(key);
    return { totalHits: Number(row.total_hits), resetTime: new Date(row.reset_at) };
  }

  async decrement(_key: string): Promise<void> { /* no limiter uses skip options */ }
  async resetKey(key: string): Promise<void> {
    this.local.delete(key);
    await supabaseAdmin.rpc('rate_limit_reset', { p_namespace: this.namespace, p_key_hash: this.digest(key) });
  }
}
