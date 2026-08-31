import { supabaseAdmin } from './supabaseAdmin';

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
    let q: any = supabaseAdmin.from(table).select(columns).range(from, from + PAGE - 1);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`Paginated select on ${table} failed at offset ${from}: ${error.message}`);
    all = all.concat((data || []) as T[]);
    if (!data || data.length < PAGE) break;
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
    let q: any = supabaseAdmin.from(table).select(columns).in(column, chunk);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`Chunked .in() select on ${table}.${column} failed at chunk starting ${i}: ${error.message}`);
    all = all.concat((data || []) as T[]);
  }
  return all;
}
