// The football manager game's instruction rules: the fixed vocabulary the match engine understands, and the checking that turns whatever a model
// (or a client) sends into rules that stay inside it. Nothing a model writes reaches the engine except through validateRules().
// The same vocabulary is read by lastmind-frontend/create/football/rules.js, so the two must change together.

export const GROUPS = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WF', 'ST'] as const;
export const LINES = ['goalkeeper', 'defence', 'midfield', 'attack'] as const;
const ZONES = ['own_third', 'middle_third', 'final_third'] as const;
const SIDES = ['left', 'centre', 'right', 'wide'] as const;
const POSSESSION = ['with', 'without', 'any'] as const;
const SCORES = ['winning', 'drawing', 'losing'] as const;
const STAGES = ['build', 'final', 'transAtt', 'transDef', 'press', 'without'] as const;

export type Scope = { kind: 'team' } | { kind: 'line'; line: string } | { kind: 'group'; group: string } | { kind: 'player'; number: number };
export type Opp = { number: number; name: string };
export type Rule = { id: string; text: string; scope: Scope; when: Record<string, unknown>; effects: Record<string, unknown>[] };

const num = (v: unknown, lo: number, hi: number): number | null => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const inList = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function cleanScope(raw: any, numbers: number[]): Scope | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'team') return { kind: 'team' };
  if (raw.kind === 'line') { const line = inList(raw.line, LINES); return line ? { kind: 'line', line } : null; }
  if (raw.kind === 'group') { const group = inList(raw.group, GROUPS); return group ? { kind: 'group', group } : null; }
  if (raw.kind === 'player') { const n = Math.round(Number(raw.number)); return numbers.includes(n) ? { kind: 'player', number: n } : null; }
  return null;
}

function cleanTarget(raw: any, numbers: number[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const t: Record<string, unknown> = {};
  const g = inList(raw.group, GROUPS); if (g) t.group = g;
  const l = inList(raw.line, LINES); if (l) t.line = l;
  if (raw.number != null) { const n = Math.round(Number(raw.number)); if (numbers.includes(n)) t.number = n; }
  if (typeof raw.side === 'string' && ['same', 'opposite', 'left', 'centre', 'right', 'wide'].includes(raw.side)) t.side = raw.side;
  return Object.keys(t).length ? t : null;
}

// One effect, or null when it is not something the engine can do.
export function cleanEffect(raw: any, numbers: number[], opp: Opp[] = []): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  switch (raw.type) {
    case 'passLength': { const pref = inList(raw.pref, ['short', 'long'] as const), s = num(raw.strength, 0, 1); return pref && s != null ? { type: 'passLength', pref, strength: r2(s) } : null; }
    case 'passTarget': { const to = cleanTarget(raw.to, numbers), w = num(raw.weight, -1, 1); return to && w != null ? { type: 'passTarget', to, weight: r2(w) } : null; }
    case 'passDirection': { const dir = inList(raw.dir, ['forward', 'sideways', 'backward'] as const), w = num(raw.weight, -1, 1); return dir && w != null ? { type: 'passDirection', dir, weight: r2(w) } : null; }
    case 'freeMan': { const w = num(raw.weight, 0, 1); return w != null ? { type: 'freeMan', weight: r2(w) } : null; }
    case 'risk': case 'dribble': case 'shoot': case 'tempo': case 'runs': case 'closeDown': case 'tackle': {
      const d = num(raw.delta, -1, 1); return d != null ? { type: raw.type, delta: r2(d) } : null;
    }
    case 'holdUp': return { type: 'holdUp', on: raw.on !== false };
    case 'stepUp': return { type: 'stepUp', on: raw.on !== false };
    case 'position': {
      const f = num(raw.forward ?? 0, -15, 15), w = num(raw.wide ?? 0, -12, 12), ph = inList(raw.phase ?? 'both', ['with', 'without', 'both'] as const);
      return f != null && w != null && ph && (f !== 0 || w !== 0) ? { type: 'position', forward: r2(f), wide: r2(w), phase: ph } : null;
    }
    case 'mark': {
      const t = raw.target && typeof raw.target === 'object' ? raw.target : {};
      const byNum = t.number != null ? opp.find((o) => o.number === Math.round(Number(t.number))) : undefined;
      const nm = typeof t.name === 'string' ? t.name.trim().toLowerCase() : '';
      const byName = nm ? opp.find((o) => o.name.toLowerCase() === nm || o.name.toLowerCase().split(' ').slice(-1)[0] === nm) : undefined;
      const one = byName || byNum;
      if (one) return { type: 'mark', target: { number: one.number, name: one.name }, tight: true };
      const target = cleanTarget(t, []);
      return target && !('number' in target) ? { type: 'mark', target, tight: raw.tight !== false } : null;
    }
    default: return null;
  }
}

export function cleanWhen(raw: any): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return w;
  const p = inList(raw.possession, POSSESSION); if (p && p !== 'any') w.possession = p;
  if (Array.isArray(raw.zone)) { const z = raw.zone.map((x: unknown) => inList(x, ZONES)).filter(Boolean); if (z.length && z.length < 3) w.zone = z; }
  else { const z = inList(raw.zone, ZONES); if (z) w.zone = [z]; }
  const stg = (Array.isArray(raw.stage) ? raw.stage : raw.stage ? [raw.stage] : []).map((x: unknown) => inList(x, STAGES)).filter(Boolean); if (stg.length && stg.length < STAGES.length) w.stage = stg;
  const pr = inList(raw.pressed, ['pressed', 'free'] as const); if (pr) w.pressed = pr;
  const sd = inList(raw.side, SIDES); if (sd) w.side = sd;
  const sc = inList(raw.score, SCORES); if (sc) w.score = sc;
  const a = num(raw.minFrom, 0, 120), b = num(raw.minTo, 0, 120);
  if (a != null && a > 0) w.minFrom = Math.round(a);
  if (b != null && b < 120) w.minTo = Math.round(b);
  return w;
}

let seq = 0;
export function validateRules(raw: any, numbers: number[], fallbackScope: Scope, textFallback: string, opp: Opp[] = []): { rules: Rule[]; dropped: string[] } {
  const list: any[] = Array.isArray(raw) ? raw : [];
  const rules: Rule[] = [], dropped: string[] = [];
  list.slice(0, 4).forEach((r) => {
    const effects = (Array.isArray(r && r.effects) ? r.effects : []).slice(0, 6).map((e: any) => cleanEffect(e, numbers, opp)).filter(Boolean) as Record<string, unknown>[];
    if (!effects.length) { dropped.push(String((r && r.summary) || 'an instruction')); return; }
    // A rule that names a scope must name a real one: a player who is not in the squad must not quietly turn into an instruction for everyone.
    const scope = r.scope == null ? fallbackScope : cleanScope(r.scope, numbers);
    if (!scope) { dropped.push((r && r.summary) ? String(r.summary) + ' (it names someone who is not in the squad)' : 'an instruction for someone who is not in the squad'); return; }
    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 240) : '';
    rules.push({ id: 'ai' + Date.now().toString(36) + (seq++), text: summary || textFallback, scope, when: cleanWhen(r.when), effects });
  });
  return { rules, dropped };
}
