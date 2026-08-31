import { supabaseAdmin } from './supabaseAdmin';

// Both paginated helpers below turn ONE logical fetch into many
// sequential Supabase REST calls (a 1200-row table is 2+ pages; a
// 1200-id .in() list is 6+ chunks) — found live via a real "TypeError:
// fetch failed" on one such call (Render -> Supabase, likely a transient
// network blip, not a logic bug: identical query succeeds locally every
// time). More round trips per page load means more chances for exactly
// one of them to blip, so every individual call gets a short retry
// rather than failing the whole page load over one transient hiccup.
const TRANSIENT_RETRY_DELAYS_MS = [300, 1000, 2500];

async function withTransientRetry<T>(fn: () => Promise<{ data: T | null; error: { message: string } | null }>, label: string) {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await fn();
    if (!error) return { data, error };
    const transient = /fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(error.message);
    if (!transient || attempt >= TRANSIENT_RETRY_DELAYS_MS.length) return { data, error };
    const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
    console.warn(`Supabase call (${label}) hit a transient error — retrying in ${delay}ms: ${error.message}`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

/**
 * PostgREST/Supabase caps a plain .select() at 1000 rows by default — the
 * same bug already found and fixed once in scripts/ingest_knowledge_map.js
 * (silently dropped 340/1741 edges), rediscovered live in
 * knowledgeMapService.ts's getKnowledgeMapForSubject (silently truncated
 * 1209 real nodes to 1000) while building the chain-diagnostic gate. One
 * shared helper so this stops needing to be rediscovered per call site.
 * `build` receives a fresh query builder per page to apply .eq()/other
 * filters — never .range() (this function owns paging) and never a large
 * .in() list (see selectRowsByIdChunked below for that).
 */
export async function selectAllRows<T>(table: string, columns: string, build?: (query: any) => any): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withTransientRetry(() => {
      let q: any = supabaseAdmin.from(table).select(columns).range(from, from + PAGE - 1);
      if (build) q = build(q);
      return q;
    }, `${table} page @${from}`);
    if (error) throw new Error(`Paginated select on ${table} failed at offset ${from}: ${error.message}`);
    all = all.concat((data || []) as T[]);
    if (!data || (data as unknown[]).length < PAGE) break;
  }
  return all;
}

/**
 * An .in() filter over a large id list can itself exceed the request
 * size PostgREST accepts — found live via a "Bad Request" passing ~1200
 * knowledge-map node ids to a single .in() call. Chunks the id list and
 * unions the results instead. 200 is comfortably under every limit
 * observed for uuid-length ids.
 */
export async function selectRowsByIdChunked<T>(
  table: string,
  columns: string,
  column: string,
  ids: string[],
  build?: (query: any) => any
): Promise<T[]> {
  const CHUNK = 200;
  let all: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { data, error } = await withTransientRetry(() => {
      let q: any = supabaseAdmin.from(table).select(columns).in(column, chunk);
      if (build) q = build(q);
      return q;
    }, `${table}.${column} chunk @${i}`);
    if (error) throw new Error(`Chunked .in() select on ${table}.${column} failed at chunk starting ${i}: ${error.message}`);
    all = all.concat((data || []) as T[]);
  }
  return all;
}
