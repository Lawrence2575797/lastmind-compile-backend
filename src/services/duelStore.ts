import crypto from 'crypto';
import { supabaseAdmin } from './supabaseAdmin';

// Storage for two-player Law duels (table: scripts/2026-09-22_create_law_duels.sql).
export type Side = 'defence' | 'prosecution';
export interface DuelResult { established: string[]; persuasion: number; at: string }
export interface DuelRow {
  id: string; code: string; creator_id: string; creator_side: Side; opponent_id: string | null; title: string;
  meta: Record<string, unknown>; graph: any; creator_result: DuelResult | null; opponent_result: DuelResult | null; updated_at: string;
}

export const tableMissing = (err: any) => !!err && (err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(String(err.message || '')));

// No 0/O/1/I so a code read out or typed from a phone is hard to get wrong.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
export const cleanCode = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '');

export const otherSide = (s: Side): Side => (s === 'defence' ? 'prosecution' : 'defence');
export const sideOf = (d: DuelRow, userId: string): Side | null =>
  d.creator_id === userId ? d.creator_side : d.opponent_id === userId ? otherSide(d.creator_side) : null;
export const resultOf = (d: DuelRow, side: Side): DuelResult | null => (side === d.creator_side ? d.creator_result : d.opponent_result);

export async function createDuel(userId: string, side: Side, title: string, meta: Record<string, unknown>, graph: unknown): Promise<{ code?: string; unavailable?: boolean; error?: string }> {
  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    const { error } = await supabaseAdmin.from('law_duels').insert({ code, creator_id: userId, creator_side: side, title, meta, graph });
    if (!error) return { code };
    if (tableMissing(error)) return { unavailable: true };
    if (error.code !== '23505') return { error: error.message };   // 23505 = that code already exists: try another
  }
  return { error: 'could not make a code' };
}

export async function getDuel(code: string): Promise<{ duel?: DuelRow; unavailable?: boolean }> {
  const { data, error } = await supabaseAdmin.from('law_duels').select('*').eq('code', code).maybeSingle();
  if (tableMissing(error)) return { unavailable: true };
  return { duel: (data as DuelRow) || undefined };
}

// Take the free seat. The update only succeeds while the seat is still empty, so two people entering one code at once cannot both get it.
export async function claimSeat(d: DuelRow, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('law_duels').update({ opponent_id: userId, updated_at: new Date().toISOString() }).eq('id', d.id).is('opponent_id', null).select('id');
  return !!(data && data.length);
}

export async function saveResult(d: DuelRow, side: Side, established: string[], persuasion: number): Promise<void> {
  const result: DuelResult = { established, persuasion, at: new Date().toISOString() };
  const col = side === d.creator_side ? 'creator_result' : 'opponent_result';
  const { error } = await supabaseAdmin.from('law_duels').update({ [col]: result, updated_at: result.at }).eq('id', d.id);
  if (error) throw error;
}

export async function listDuels(userId: string) {
  const { data, error } = await supabaseAdmin.from('law_duels').select('code, title, creator_id, creator_side, opponent_id, creator_result, opponent_result, updated_at')
    .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`).order('updated_at', { ascending: false }).limit(50);
  if (tableMissing(error)) return { unavailable: true as const };
  if (error) throw error;
  return {
    duels: (data || []).map((d: any) => {
      const mine: Side = d.creator_id === userId ? d.creator_side : otherSide(d.creator_side);
      const myDone = !!(d.creator_id === userId ? d.creator_result : d.opponent_result);
      const theirDone = !!(d.creator_id === userId ? d.opponent_result : d.creator_result);
      return { code: d.code, title: d.title, mySide: mine, myDone, opponentJoined: d.creator_id === userId ? !!d.opponent_id : true, opponentDone: theirDone, updatedAt: d.updated_at };
    }),
  };
}
