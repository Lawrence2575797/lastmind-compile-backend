import { Router, Request, Response } from 'express';
import { requireAuth } from '../services/authMiddleware';
import { actionEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import { createGame, getGame, saveState, GameRow, GameState } from '../services/footballGameService';

// Football manager multiplayer by game code: see footballGameService.ts. Every call is a POST (the football page's api helper only posts), is
// for a signed-in manager, and only ever touches a game that manager sits in (or is joining by its code).
const router = Router();
router.use('/football-mp', requireAuth);

const IDLE_MS = 24 * 60 * 60 * 1000;   // the default time a round waits for plans
// how long managers get to lock in a plan, chosen when the game is set up (minutes)
const DEADLINE_MINUTES = [30, 60, 180, 360, 720, 1440, 2880, 4320, 10080];
const deadlineOf = (g: GameRow) => g.state.deadlineMs || IDLE_MS;
const CODE = /^[A-Z2-9]{6}$/;
const TEAM = /^t[1-9][0-9]?$/;
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/[^\w\s.'-]/g, '').slice(0, 24) : '') || 'Manager';
// The plans handed in for the round being waited for stay private until every seated manager has handed one in (or the round has been left
// for a day): nobody can read how the other manager is going to play before committing to their own. Plans of rounds already played are open.
const visiblePlans = (g: GameRow, userId: string) => {
  const cur = String(g.state.round), seated = Object.keys(g.state.seats);
  const handed = g.state.plans[cur] || {};
  const everyone = seated.length > 0 && seated.every((t) => handed[t]);
  const idle = !!g.state.roundAt && Date.now() - Date.parse(g.state.roundAt) > deadlineOf(g);
  const mine = Object.keys(g.state.seats).find((t) => g.state.seats[t].userId === userId) || null;
  const out: Record<string, any> = {};
  Object.keys(g.state.plans).forEach((r) => {
    if (r !== cur || g.state.finished || everyone || idle) out[r] = g.state.plans[r];
    else out[r] = mine && g.state.plans[r][mine] ? { [mine]: g.state.plans[r][mine] } : {};
  });
  return out;
};
const view = (g: GameRow, userId: string) => ({
  code: g.code, kind: g.kind, seed: g.seed, runSeed: g.runSeed, version: g.version, updatedAt: g.updatedAt,
  state: Object.assign({}, g.state, { plans: visiblePlans(g, userId) }),
  you: Object.keys(g.state.seats).find((t) => g.state.seats[t].userId === userId) || null,
  host: g.hostId === userId,
});
const seatOf = (g: GameRow, userId: string) => Object.keys(g.state.seats).find((t) => g.state.seats[t].userId === userId) || null;

// POST /football-mp/create { kind, seed, teams: [clubId], teamId, name }
router.post('/football-mp/create', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { kind, seed, teams, teamId, name, deadlineMinutes } = req.body || {};
  if ((kind !== 'league' && kind !== 'match') || !Number.isInteger(seed) || !Array.isArray(teams) || teams.length < 2 || teams.length > 16 || !teams.every((t: any) => typeof t === 'string' && TEAM.test(t)) || !TEAM.test(String(teamId)) || !teams.includes(teamId)) {
    return res.status(400).json({ error: 'invalid game' });
  }
  try {
    const dm = DEADLINE_MINUTES.includes(Number(deadlineMinutes)) ? Number(deadlineMinutes) : 1440;
    const g = await createGame(req.userId as string, kind, seed, teams, teamId, cleanName(name), dm * 60 * 1000);
    res.json(view(g, req.userId as string));
  } catch (err) {
    console.error('Football game create failed:', err);
    res.status(500).json({ error: 'could not start that game' });
  }
});

// POST /football-mp/join { code, teamId, name }
router.post('/football-mp/join', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { code, teamId, name } = req.body || {};
  const c = String(code || '').toUpperCase().trim();
  if (!CODE.test(c) || !TEAM.test(String(teamId))) return res.status(400).json({ error: 'invalid code or club' });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = await getGame(c);
      if (!g) return res.status(404).json({ error: 'No game has that code.' });
      const userId = req.userId as string;
      if (seatOf(g, userId)) return res.json(view(g, userId));   // already sitting there: just come back in
      if (g.state.finished) return res.status(409).json({ error: 'That game has finished.' });
      if (!g.state.teams.includes(teamId)) return res.status(400).json({ error: 'That club is not in this game.' });
      if (g.state.seats[teamId]) return res.status(409).json({ error: 'Somebody has already taken that club.' });
      if (g.kind === 'match' && Object.keys(g.state.seats).length >= 2) return res.status(409).json({ error: 'That match already has both managers.' });
      const state: GameState = JSON.parse(JSON.stringify(g.state));
      state.seats[teamId] = { userId, name: cleanName(name), joinedAt: new Date().toISOString() };
      if (await saveState(g, state)) return res.json(view(Object.assign({}, g, { state, version: g.version + 1 }), userId));
    }
    res.status(409).json({ error: 'Busy: try again.' });
  } catch (err) {
    console.error('Football game join failed:', err);
    res.status(500).json({ error: 'could not join that game' });
  }
});

// POST /football-mp/state { code }
router.post('/football-mp/state', syncEndpointLimiter, async (req: Request, res: Response) => {
  const c = String((req.body || {}).code || '').toUpperCase().trim();
  if (!CODE.test(c)) return res.status(400).json({ error: 'invalid code' });
  try {
    const g = await getGame(c);
    if (!g) return res.status(404).json({ error: 'No game has that code.' });
    if (!seatOf(g, req.userId as string)) {
      // someone looking a code up before sitting down sees only who is in and which clubs are free
      return res.json({ code: g.code, kind: g.kind, seed: g.seed, runSeed: g.runSeed, you: null, preview: true,
        state: { kind: g.state.kind, hostTeam: g.state.hostTeam, teams: g.state.teams, seats: Object.fromEntries(Object.entries(g.state.seats).map(([k, s]) => [k, { name: s.name }])), round: g.state.round, finished: g.state.finished } });
    }
    res.json(view(g, req.userId as string));
  } catch (err) {
    console.error('Football game state failed:', err);
    res.status(500).json({ error: 'could not load that game' });
  }
});

// POST /football-mp/submit { code, teamId, round, plan }
router.post('/football-mp/submit', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { code, teamId, round, plan } = req.body || {};
  const c = String(code || '').toUpperCase().trim();
  if (!CODE.test(c) || !TEAM.test(String(teamId)) || !Number.isInteger(round) || !plan || typeof plan !== 'object') return res.status(400).json({ error: 'invalid plan' });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = await getGame(c);
      if (!g) return res.status(404).json({ error: 'No game has that code.' });
      const userId = req.userId as string;
      if (!g.state.seats[teamId] || g.state.seats[teamId].userId !== userId) return res.status(403).json({ error: 'That is not your club.' });
      if (g.state.finished || round !== g.state.round) return res.status(409).json({ error: 'That round has already been played.', round: g.state.round });
      const state: GameState = JSON.parse(JSON.stringify(g.state));
      const key = String(round);
      state.plans[key] = state.plans[key] || {};
      state.plans[key][teamId] = { plan, at: new Date().toISOString() };
      if (await saveState(g, state)) return res.json(view(Object.assign({}, g, { state, version: g.version + 1 }), userId));
    }
    res.status(409).json({ error: 'Busy: try again.' });
  } catch (err) {
    console.error('Football plan submit failed:', err);
    res.status(500).json({ error: 'could not save your plan' });
  }
});

// POST /football-mp/played { code, round, scores: [{id,hg,ag}] }
// Said by the browser that played the round. Only once every seated manager has a plan in (or the host chooses to go on without the others).
router.post('/football-mp/played', actionEndpointLimiter, async (req: Request, res: Response) => {
  const { code, round, scores } = req.body || {};
  const c = String(code || '').toUpperCase().trim();
  if (!CODE.test(c) || !Number.isInteger(round) || !Array.isArray(scores) || scores.length > 16) return res.status(400).json({ error: 'invalid result' });
  const clean = scores.map((s: any) => ({ id: String(s && s.id || ''), hg: Number(s && s.hg), ag: Number(s && s.ag) })).filter((s: any) => TEAM.test(s.id) && Number.isFinite(s.hg) && Number.isFinite(s.ag));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const g = await getGame(c);
      if (!g) return res.status(404).json({ error: 'No game has that code.' });
      const userId = req.userId as string, mine = seatOf(g, userId);
      if (!mine) return res.status(403).json({ error: 'You are not in that game.' });
      if (round !== g.state.round || g.state.finished) return res.json(view(g, userId));   // somebody got there first: the state says so
      const seated = Object.keys(g.state.seats), planned = Object.keys(g.state.plans[String(round)] || {});
      const everyone = seated.every((t) => planned.includes(t));
      // a manager who has gone quiet for a day does not hold everyone else up: their club plays on as it is
      const idle = Date.now() - Date.parse(g.state.roundAt || g.updatedAt) > deadlineOf(g);
      if (!everyone && !idle) return res.status(409).json({ error: 'Not everybody has handed their plan in yet.' });
      const state: GameState = JSON.parse(JSON.stringify(g.state));
      state.played.push({ round, at: new Date().toISOString(), by: mine, scores: clean, forced: !everyone });
      state.round = round + 1;
      state.roundAt = new Date().toISOString();
      state.finished = state.kind === 'match' || state.round >= 14;   // a one-off match is one round; the league is fourteen
      if (await saveState(g, state)) return res.json(view(Object.assign({}, g, { state, version: g.version + 1 }), userId));
    }
    res.status(409).json({ error: 'Busy: try again.' });
  } catch (err) {
    console.error('Football round result failed:', err);
    res.status(500).json({ error: 'could not record that round' });
  }
});

export default router;
