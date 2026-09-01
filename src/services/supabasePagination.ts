import { supabaseAdmin } from './supabaseAdmin';

// Both paginated helpers below turn ONE logical fetch into several
// Supabase REST calls (a 1200-row table is 2+ pages; a 1200-id .in() list
// is 30 chunks at CHUNK=40 — see selectRowsByIdChunked's own comment on
// why that chunk size). Running them SEQUENTIALLY (the original version
// of this file) made a subject-wide knowledge-map load noticeably slow —
// 30 round trips end-to-end instead of 30 round trips in parallel is the
// actual difference between "instant" and "takes a while" here, not the
// query logic itself. Every call still gets a short retry on a
// transient-looking error, since more concurrent requests is still more
// chances for exactly one to blip.
const TRANSIENT_RETRY_DELAYS_MS = [300, 1000, 2500];

// Every caller passes a live supabase-js query builder chain (already
// typed as `any` throughout this file, same as the rest of the codebase's
// dynamic-table helpers) — typed loosely here to match rather than fight
// supabase-js's own builder types across two very different result shapes
// (a plain select vs. a `{count: 'exact'}` head request).
async function withTransientRetry(fn: () => any, label: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const result = await fn();
    if (!result.error) return result;
    const transient = /fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(result.error.message);
    if (!transient || attempt >= TRANSIENT_RETRY_DELAYS_MS.length) return result;
    const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
    console.warn(`Supabase call (${label}) hit a transient error — retrying in ${delay}ms: ${result.error.message}`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

/**
 * PostgREST/Supabase caps a plain .select() at 1000 rows by default — the
 * same bug already found and fixed once in scripts/ingest_knowledge_map.js
 * (silently dropped 340/1741 edges), rediscovered live in
 * knowledgeMapService.ts's getKnowledgeMapForSubject (silently truncated
 * 1209 real nodes to 1000). One shared helper so this stops needing to be
 * rediscovered per call site. `build` receives a fresh query builder each
 * time to apply .eq()/other filters — never .range() (this function owns
 * paging) and never a large .in() list (see selectRowsByIdChunked below).
 * Fetches the real count first so every page can be requested in
 * PARALLEL — a 2-page table no longer pays for 2 sequential round trips.
 */
export async function selectAllRows<T>(table: string, columns: string, build?: (query: any) => any): Promise<T[]> {
  const PAGE = 1000;

  let countQuery: any = supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
  if (build) countQuery = build(countQuery);
  const { count, error: countError } = await withTransientRetry(() => countQuery, `${table} count`);
  if (countError) throw new Error(`Count for ${table} failed: ${countError.message}`);
  const total = count ?? 0;
  if (total === 0) return [];

  const pageStarts: number[] = [];
  for (let from = 0; from < total; from += PAGE) pageStarts.push(from);

  const pages = await Promise.all(
    pageStarts.map((from) =>
      withTransientRetry(() => {
        let q: any = supabaseAdmin.from(table).select(columns).range(from, from + PAGE - 1);
        if (build) q = build(q);
        return q;
      }, `${table} page @${from}`)
    )
  );

  const all: T[] = [];
  pages.forEach(({ data, error }, i) => {
    if (error) throw new Error(`Paginated select on ${table} failed at offset ${pageStarts[i]}: ${error.message}`);
    all.push(...((data || []) as T[]));
  });
  return all;
}

/**
 * An .in() filter over a large id list can itself exceed the request
 * size PostgREST accepts — found live via a "Bad Request" passing ~1200
 * knowledge-map node ids to a single .in() call, and a "fetch failed"
 * from Render specifically (not from a dev machine) at 200 per chunk,
 * pointing at Render's own outbound connection choking on the request
 * itself rather than a one-off blip. 40 stayed safely under that.
 * Every chunk fires in PARALLEL (see this file's own top comment) — the
 * whole lookup is now bounded by the slowest single chunk, not the sum
 * of all of them.
 */
export async function selectRowsByIdChunked<T>(
  table: string,
  columns: string,
  column: string,
  ids: string[],
  build?: (query: any) => any
): Promise<T[]> {
  const CHUNK = 40;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk, idx) =>
      withTransientRetry(() => {
        let q: any = supabaseAdmin.from(table).select(columns).in(column, chunk);
        if (build) q = build(q);
        return q;
      }, `${table}.${column} chunk @${idx * CHUNK}`)
    )
  );

  const all: T[] = [];
  results.forEach(({ data, error }, idx) => {
    if (error) throw new Error(`Chunked .in() select on ${table}.${column} failed at chunk starting ${idx * CHUNK}: ${error.message}`);
    all.push(...((data || []) as T[]));
  });
  return all;
}
