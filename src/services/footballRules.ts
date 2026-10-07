// The football manager game's instruction rules and the checking that turns whatever a model (or a client) sends into rules the match engine can run.
// Nothing a model writes reaches the engine except through validateRules(). Besides ready-made effects (pass length, risk, closing down and so on), a rule
// can place a player with a small expression (stand level with Thorne, stay between the ball and a named opponent), score passes with a condition on
// the receiver, and draw a named opponent towards a player. Expressions are data, not code: a few named operations on measured quantities, with limits on
// size and depth, evaluated by lastmind-frontend/create/football/rules.js. The two files must change together.

export const GROUPS = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WF', 'ST'] as const;
export const LINES = ['goalkeeper', 'defence', 'midfield', 'attack'] as const;
const ZONES = ['own_third', 'middle_third', 'final_third'] as const;
const SIDES = ['left', 'centre', 'right', 'wide'] as const;
const POSSESSION = ['with', 'without', 'any'] as const;
const SCORES = ['winning', 'drawing', 'losing'] as const;
const STAGES = ['build', 'final', 'transAtt', 'transDef', 'press', 'without'] as const;

export type Scope = { kind: 'team' } | { kind: 'line'; line: string } | { kind: 'group'; group: string } | { kind: 'slot'; slot: string } | { kind: 'player'; number: number };
export type Opp = { number: number; name: string; slot?: string; group?: string };
export type Rule = { id: string; text: string; scope: Scope; when: Record<string, unknown>; effects: Record<string, unknown>[] };
type Squads = { own: Opp[]; opp: Opp[] };

const num = (v: unknown, lo: number, hi: number): number | null => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const inList = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;
const surname = (n: string) => n.toLowerCase().split(' ').slice(-1)[0];

// A position on the pitch as the formation names it: LB, RCB, LAM, RST and so on. A player of one club is found by position, shirt number or name.
const slotOk = (list: Opp[], v: unknown): string | null => (typeof v === 'string' && list.some((o) => (o.slot || '').toUpperCase() === v.trim().toUpperCase()) ? v.trim().toUpperCase() : null);
function findPlayer(list: Opp[], raw: any): Opp | undefined {
  const bySlot = raw && typeof raw.slot === 'string' ? list.find((o) => (o.slot || '').toUpperCase() === raw.slot.trim().toUpperCase()) : undefined;
  if (bySlot && raw.number == null && !raw.name) return bySlot;
  const byNum = raw && raw.number != null ? list.find((o) => o.number === Math.round(Number(raw.number))) : undefined;
  const nm = raw && typeof raw.name === 'string' ? raw.name.trim().toLowerCase() : '';
  const byName = nm ? list.find((o) => o.name.toLowerCase() === nm || surname(o.name) === nm) : undefined;
  return byName || byNum;
}

export function cleanScope(raw: any, own: Opp[]): Scope | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'team') return { kind: 'team' };
  if (raw.kind === 'line') { const line = inList(raw.line, LINES); return line ? { kind: 'line', line } : null; }
  if (raw.kind === 'group') { const group = inList(raw.group, GROUPS); return group ? { kind: 'group', group } : null; }
  if (raw.kind === 'slot') { const slot = slotOk(own, raw.slot); return slot ? { kind: 'slot', slot } : null; }
  if (raw.kind === 'player') { const p = findPlayer(own, raw); return p ? { kind: 'player', number: p.number } : null; }
  return null;
}

function cleanTarget(raw: any, own: Opp[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const t: Record<string, unknown> = {};
  const g = inList(raw.group, GROUPS); if (g) t.group = g;
  const l = inList(raw.line, LINES); if (l) t.line = l;
  if (raw.number != null || raw.name != null) { const p = findPlayer(own, raw); if (p) t.number = p.number; }
  const sl = slotOk(own, raw.slot); if (sl) t.slot = sl;
  if (typeof raw.side === 'string' && ['same', 'opposite', 'left', 'centre', 'right', 'wide'].includes(raw.side)) t.side = raw.side;
  return Object.keys(t).length ? t : null;
}

// ---------- expressions and conditions ----------
// An entity is something with a position: the player the rule is for, the ball, a named player of either club, the nearest of a kind, a goal.
type Counter = { n: number };
const ENTITIES = ['me', 'ball', 'carrier', 'opp_last', 'own_goal', 'their_goal', 'centre', 'receiver'] as const;
function cleanEntity(raw: any, sq: Squads, depth = 0): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || depth > 2) return null;
  const e = raw.e;
  if ((ENTITIES as readonly string[]).includes(e)) return { e };
  if (e === 'player') {
    const side = raw.side === 'opp' ? 'opp' : 'own', p = findPlayer(side === 'opp' ? sq.opp : sq.own, raw);
    return p ? { e: 'player', side, number: p.number, name: p.name } : null;
  }
  if (e === 'slot') {
    const side = raw.side === 'opp' ? 'opp' : 'own', list = side === 'opp' ? sq.opp : sq.own, slot = slotOk(list, raw.slot);
    return slot ? { e: 'slot', side, slot } : null;
  }
  if (e === 'group' || e === 'line') {
    const side = raw.side === 'opp' ? 'opp' : 'own', agg = inList(raw.agg ?? 'avg', ['avg', 'min', 'max'] as const);
    if (e === 'group') { const g = inList(raw.group, GROUPS); return g && agg ? { e: 'group', side, group: g, agg } : null; }
    const l = inList(raw.line, LINES); return l && agg ? { e: 'line', side, line: l, agg } : null;
  }
  if (e === 'nearest') {
    const side = raw.side === 'own' ? 'own' : 'opp', group = inList(raw.group, GROUPS), to = raw.to ? cleanEntity(raw.to, sq, depth + 1) : null;
    return { e: 'nearest', side, ...(group ? { group } : {}), ...(to ? { to } : {}) };
  }
  return null;
}
function cleanExpr(raw: any, sq: Squads, c: Counter, depth = 0): any {
  if (++c.n > 40 || depth > 6) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(-1000, Math.min(1000, raw)) : null;
  if (!raw || typeof raw !== 'object') return null;
  if (raw.var != null) return inList(raw.var, ['minute', 'scoreDiff', 'pressed'] as const) ? { var: raw.var } : null;
  if (raw.attr != null) {
    const attr = inList(raw.attr, ['dm', 'wm', 'dist', 'press'] as const), of = cleanEntity(raw.of, sq), to = raw.to ? cleanEntity(raw.to, sq) : null;
    return attr && of ? { attr, of, ...(to ? { to } : {}) } : null;
  }
  const op = inList(raw.op, ['add', 'sub', 'mul', 'div', 'min', 'max', 'abs', 'clamp'] as const);
  if (!op) return null;
  const args = (Array.isArray(raw.args) ? raw.args : []).slice(0, 3).map((a: unknown) => cleanExpr(a, sq, c, depth + 1));
  const need = op === 'abs' ? 1 : op === 'clamp' ? 3 : 2;
  if (args.length < need || args.some((a: unknown) => a == null)) return null;
  return { op, args: args.slice(0, need) };
}
function cleanPred(raw: any, sq: Squads, c: Counter, depth = 0): any {
  if (++c.n > 40 || depth > 5 || !raw || typeof raw !== 'object') return null;
  if (raw.op === 'and' || raw.op === 'or') {
    const args = (Array.isArray(raw.args) ? raw.args : []).slice(0, 4).map((a: unknown) => cleanPred(a, sq, c, depth + 1));
    return args.length && !args.some((a: unknown) => a == null) ? { op: raw.op, args } : null;
  }
  if (raw.op === 'not') { const a = cleanPred(Array.isArray(raw.args) ? raw.args[0] : raw.arg, sq, c, depth + 1); return a ? { op: 'not', args: [a] } : null; }
  if (raw.cmp != null) {
    const cmp = inList(raw.cmp, ['lt', 'gt', 'lte', 'gte', 'eq'] as const), a = cleanExpr(raw.a, sq, c), b = cleanExpr(raw.b, sq, c);
    return cmp && a != null && b != null ? { cmp, a, b } : null;
  }
  if (raw.is === 'group') { const of = cleanEntity(raw.of, sq), v = inList(raw.value, GROUPS); return of && v ? { is: 'group', of, value: v } : null; }
  if (raw.is === 'slot') { const of = cleanEntity(raw.of, sq), v = slotOk([...sq.own, ...sq.opp], raw.value); return of && v ? { is: 'slot', of, value: v } : null; }
  if (raw.is === 'player') {
    const of = cleanEntity(raw.of, sq), side = raw.side === 'opp' ? 'opp' : 'own', p = findPlayer(side === 'opp' ? sq.opp : sq.own, raw);
    return of && p ? { is: 'player', of, number: p.number, name: p.name, side } : null;
  }
  return null;
}

// One effect, or null when it is not something the engine can do.
export function cleanEffect(raw: any, sq: Squads): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const own = sq.own, opp = sq.opp;
  switch (raw.type) {
    case 'passLength': { const pref = inList(raw.pref, ['short', 'long'] as const), s = num(raw.strength, 0, 1); return pref && s != null ? { type: 'passLength', pref, strength: r2(s) } : null; }
    case 'passTarget': { const to = cleanTarget(raw.to, own), w = num(raw.weight, -1, 1); return to && w != null ? { type: 'passTarget', to, weight: r2(w) } : null; }
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
      const one = findPlayer(opp, t);
      if (one) return { type: 'mark', target: { number: one.number, name: one.name }, tight: true };
      const target = cleanTarget(t, []);
      return target && !('number' in target) ? { type: 'mark', target, tight: raw.tight !== false } : null;
    }
    // Stand where an expression says, on one or both axes (metres: dm from the own goal line towards the attack, wm from the team's left touchline).
    case 'place': {
      const dm = raw.dm != null ? cleanExpr(raw.dm, sq, { n: 0 }) : null, wm = raw.wm != null ? cleanExpr(raw.wm, sq, { n: 0 }) : null;
      const w = num(raw.weight ?? 0.85, 0.1, 1), ph = inList(raw.phase ?? 'both', ['with', 'without', 'both'] as const);
      return (dm != null || wm != null) && w != null && ph ? { type: 'place', ...(dm != null ? { dm } : {}), ...(wm != null ? { wm } : {}), weight: r2(w), phase: ph } : null;
    }
    // Favour (or avoid) passes to any receiver the condition holds for. The receiver is {"e":"receiver"}; the passer is {"e":"me"}.
    case 'passScore': { const where = cleanPred(raw.where, sq, { n: 0 }), w = num(raw.weight, -1, 1); return where && w != null ? { type: 'passScore', where, weight: r2(w) } : null; }
    // Draw a named opposition player towards this player: when they press, that opponent is more likely to be the one who comes to him.
    case 'attract': { const p = findPlayer(opp, raw.target || raw), s = num(raw.strength ?? 0.7, 0.1, 1); return p && s != null ? { type: 'attract', target: { number: p.number, name: p.name }, strength: r2(s) } : null; }
    default: return null;
  }
}

export function cleanWhen(raw: any, sq: Squads): Record<string, unknown> {
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
  if (raw.expr) { const e = cleanPred(raw.expr, sq, { n: 0 }); if (e) w.expr = e; }
  return w;
}

let seq = 0;
export function validateRules(raw: any, own: Opp[], fallbackScope: Scope, textFallback: string, opp: Opp[] = []): { rules: Rule[]; dropped: string[] } {
  const list: any[] = Array.isArray(raw) ? raw : [];
  const sq: Squads = { own, opp };
  const rules: Rule[] = [], dropped: string[] = [];
  list.slice(0, 12).forEach((r) => {
    const effects = (Array.isArray(r && r.effects) ? r.effects : []).slice(0, 8).map((e: any) => cleanEffect(e, sq)).filter(Boolean) as Record<string, unknown>[];
    if (!effects.length) { dropped.push(String((r && r.summary) || 'an instruction')); return; }
    // A rule that names a scope must name a real one: a player who is not in the squad must not quietly turn into an instruction for everyone.
    const scope = r.scope == null ? fallbackScope : cleanScope(r.scope, own);
    if (!scope) { dropped.push((r && r.summary) ? String(r.summary) + ' (it names someone who is not in the squad)' : 'an instruction for someone who is not in the squad'); return; }
    const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, 240) : '';
    rules.push({ id: 'ai' + Date.now().toString(36) + (seq++), text: summary || textFallback, scope, when: cleanWhen(r.when, sq), effects });
  });
  return { rules, dropped };
}
