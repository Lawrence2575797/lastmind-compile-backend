import { supabaseAdmin } from './supabaseAdmin';

// Multiplayer football manager. The match engine runs in each manager's browser and is deterministic, so the server's job is only to hold what
// has to be shared: who sits at which club, each manager's submitted plan for the current round, and which rounds have been played. A round is
// played, by whichever browser sees every plan in first, from the league's seed and those plans: every browser gets the same result.

export type GameKind = 'league' | 'match';
export interface Seat { userId: string; name: string; joinedAt: string }
export interface GameState {
  kind: GameKind;
  hostTeam: string;
  teams: string[];                              // the clubs that exist in this game (a one-off match has two seats, a league has eight clubs)
  seats: Record<string, Seat>;                  // club id -> the manager sitting there
  round: number;                                // the round waiting to be played
  plans: Record<string, Record<string, { plan: unknown; at: string }>>;   // round -> club id -> that manager's plan
  played: { round: number; at: string; by: string; scores: { id: string; hg: number; ag: number }[]; forced: boolean }[];
  finished: boolean;
}
export interface GameRow { code: string; kind: GameKind; seed: number; runSeed: number; hostId: string; state: GameState; version: number; updatedAt: string }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const rowOf = (r: any): GameRow => ({ code: r.code, kind: r.kind, seed: r.seed, runSeed: r.run_seed, hostId: r.host_id, state: r.state, version: r.version, updatedAt: r.updated_at });

export async function createGame(userId: string, kind: GameKind, seed: number, teams: string[], teamId: string, name: string): Promise<GameRow> {
  const runSeed = Math.floor(Math.random() * 1_000_000_000);
  const state: GameState = { kind, hostTeam: teamId, teams, seats: { [teamId]: { userId, name, joinedAt: new Date().toISOString() } }, round: 0, plans: {}, played: [], finished: false };
  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    const { data, error } = await supabaseAdmin.from('football_games').insert({ code, kind, seed, run_seed: runSeed, host_id: userId, state, version: 1 }).select('*').single();
    if (!error && data) return rowOf(data);
    if (error && (error as any).code !== '23505') throw error;   // 23505: that code is taken, try another
  }
  throw new Error('could not make a game code');
}

export async function getGame(code: string): Promise<GameRow | null> {
  const { data, error } = await supabaseAdmin.from('football_games').select('*').eq('code', code).maybeSingle();
  if (error) throw error;
  return data ? rowOf(data) : null;
}

// Replace the state only if nobody has changed it since it was read (compare-and-set on the version).
export async function saveState(row: GameRow, state: GameState): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('football_games')
    .update({ state, version: row.version + 1, updated_at: new Date().toISOString() })
    .eq('code', row.code).eq('version', row.version).select('code');
  if (error) throw error;
  return !!(data && data.length);
}
