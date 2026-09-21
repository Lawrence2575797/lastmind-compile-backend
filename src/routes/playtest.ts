import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter, actionEndpointLimiter } from '../services/rateLimiters';
import { createAiCall } from '../services/createAi';
import { CreateCapError, assertCanSpend, getUsedUsd, recordSpend, spendSummary } from '../services/createSpend';
import { parseModelJson } from '../services/jsonParsing';
import { InsufficientLocksError } from '../services/lockService';
import { startJob } from './createSimulation';
import { generatePortraitCutout, generateEvidencePicture, downloadAsDataUrl } from '../services/createImages';
import { CASE_GRAPH_COMPILE_PROMPT, CHARACTER_TURN_PROMPT, CLOSING_ASSESSMENT_PROMPT, COMPILE_SPEECH_PROMPT } from '../constants/playtestPrompts';

const router = Router();
router.use('/playtest', requireAuth);

// ---- structure kept apart: the Case Graph is what is TRUE; the server holds the only copy Cortex ever reads ----
// (The page also holds it to run the courtroom, but a character's reply is always built here from this copy, so
// a tampered browser cannot change what a witness knows.) Sessions live in memory; the page re-sends the graph to
// restore one after a restart.
interface Session { userId: string; graph: any; createdAt: number }
const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
function sweepSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
}
const newSessionId = () => crypto.randomBytes(10).toString('hex');

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = <T>(v: unknown, cap: number): T[] => (Array.isArray(v) ? (v.slice(0, cap) as T[]) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

// Evidence content is a small structured object; anything oversized is cut down to a plain description.
function safeContent(c: unknown): Record<string, unknown> {
  if (!c || typeof c !== 'object') return {};
  const text = JSON.stringify(c);
  return text.length <= 8000 ? (c as Record<string, unknown>) : { description: text.slice(0, 2500) };
}

// ---- the compiled Case Graph, validated so the courtroom engine can rely on its shape ----
export function normaliseGraph(raw: any, creatorCase: any, concepts: { label: string }[]) {
  const facts = arr<any>(raw?.facts, 40).map((f, i) => ({
    id: str(f?.id, 20) || `f${i + 1}`,
    text: str(f?.text, 500),
    favours: oneOf(f?.favours, ['prosecution', 'defence', 'neutral'] as const, 'neutral'),
    weight: Math.min(5, Math.max(1, Math.round(Number(f?.weight) || 1))),
  })).filter((f) => f.text);
  const factIds = new Set(facts.map((f) => f.id));
  const onlyFacts = (v: unknown) => arr<string>(v, 40).map((x) => str(x, 20)).filter((x) => factIds.has(x));

  const caseChars: any[] = Array.isArray(creatorCase?.characters) ? creatorCase.characters : [];
  const caseEvidence: any[] = Array.isArray(creatorCase?.evidence) ? creatorCase.evidence : [];
  const evidenceIds = new Set(arr<any>(raw?.evidence, 20).map((e) => str(e?.id, 40)));

  const characters = arr<any>(raw?.characters, 14).map((c, i) => {
    const base = caseChars.find((x) => x.id === c?.id) || {};
    const m = c?.mind || {};
    const line = (l: any) => ({ q: str(l?.q, 400), a: str(l?.a, 800), factIds: onlyFacts(l?.factIds) });
    return {
      id: str(c?.id, 40) || `c${i + 1}`,
      name: str(c?.name, 120) || str(base.name, 120) || `Person ${i + 1}`,
      role: str(c?.role, 120) || str(base.role, 120),
      side: oneOf(c?.side, ['prosecution', 'defence', 'neutral'] as const, 'neutral'),
      portraitPrompt: str(c?.portraitPrompt, 400),
      demeanour: str(c?.demeanour, 200),
      speech: str(c?.speech, 240),
      mind: {
        knows: onlyFacts(m.knows),
        believes: arr<string>(m.believes, 8).map((x) => str(x, 300)).filter(Boolean),
        remembers: arr<string>(m.remembers, 10).map((x) => str(x, 400)).filter(Boolean),
        gaps: arr<string>(m.gaps, 8).map((x) => str(x, 300)).filter(Boolean),
        reliability: oneOf(m.reliability, ['high', 'medium', 'low'] as const, 'medium'),
        honesty: oneOf(m.honesty, ['truthful', 'mistaken', 'lying'] as const, oneOf(base.honesty, ['truthful', 'mistaken', 'lying'] as const, 'truthful')),
        concealing: onlyFacts(m.concealing),
        lieDetails: str(m.lieDetails, 500),
        candourWithOwnCounsel: oneOf(m.candourWithOwnCounsel, ['full', 'partial', 'guarded'] as const, 'partial'),
      },
      calledBy: oneOf(c?.calledBy, ['prosecution', 'defence', 'none'] as const, 'none'),
      order: Math.max(1, Math.round(Number(c?.order) || i + 1)),
      introducesEvidence: arr<string>(c?.introducesEvidence, 10).map((x) => str(x, 40)).filter((x) => evidenceIds.has(x)),
      inChief: arr<any>(c?.inChief, 6).map(line).filter((l) => l.q && l.a),
      underCross: arr<any>(c?.underCross, 6).map(line).filter((l) => l.q && l.a),
    };
  });
  const charIds = new Set(characters.map((c) => c.id));

  const evidence = arr<any>(raw?.evidence, 20).map((e, i) => {
    const base = caseEvidence.find((x) => x.id === e?.id) || {};
    return {
      id: str(e?.id, 40) || `e${i + 1}`,
      name: str(e?.name, 160) || str(base.name, 160) || `Exhibit ${i + 1}`,
      kind: oneOf(e?.kind, ['statement', 'messages', 'cctv', 'medical', 'photo', 'map', 'physical', 'document'] as const, 'document'),
      title: str(e?.title, 200) || str(e?.name, 160),
      caption: str(e?.caption, 300),
      content: safeContent(e?.content),
      factIds: onlyFacts(e?.factIds),
      favours: oneOf(e?.favours, ['prosecution', 'defence', 'neutral'] as const, 'neutral'),
      introducedBy: charIds.has(str(e?.introducedBy, 40)) ? str(e?.introducedBy, 40) : null,
    };
  });

  const sc = raw?.scripts || {};
  const paras = (v: unknown, cap = 8) => arr<string>(v, cap).map((x) => str(x, 1500)).filter(Boolean);
  const v = raw?.verdict || {};
  const meta = raw?.meta || {};
  const defendant = charIds.has(str(meta.defendantId, 40)) ? str(meta.defendantId, 40) : (characters.find((c) => /defendant|accused/i.test(c.role))?.id || characters[0]?.id || '');
  const interviewId = charIds.has(str(meta.interviewCharacterId, 40)) ? str(meta.interviewCharacterId, 40) : defendant;
  const conceptLabels = new Set(concepts.map((c) => c.label));
  return {
    meta: {
      timeUntilTrial: str(meta.timeUntilTrial, 160) || 'Trial begins tomorrow at 10:00',
      court: str(meta.court, 120) || 'The Crown Court',
      judge: str(meta.judge, 120) || 'The Honourable Judge',
      defendantId: defendant,
      interviewCharacterId: interviewId,
      clerk: str(meta.clerk, 120) || 'The Clerk',
      prosecutionCounsel: str(meta.prosecutionCounsel, 120) || 'Counsel for the Crown',
      defenceCounsel: str(meta.defenceCounsel, 120) || 'Counsel for the Defence',
    },
    facts,
    characters,
    evidence,
    caseFile: {
      summary: str(raw?.caseFile?.summary, 2500),
      agreedFacts: arr<string>(raw?.caseFile?.agreedFacts, 10).map((x) => str(x, 400)).filter(Boolean),
      chargeSheet: str(raw?.caseFile?.chargeSheet, 800),
    },
    scripts: {
      arraignment: paras(sc.arraignment, 8), prosecutionOpening: paras(sc.prosecutionOpening), defenceOpening: paras(sc.defenceOpening),
      prosecutionClosing: paras(sc.prosecutionClosing), defenceClosing: paras(sc.defenceClosing), summingUp: paras(sc.summingUp, 10),
    },
    verdict: {
      convictionThreshold: Number.isFinite(Number(v.convictionThreshold)) ? Number(v.convictionThreshold) : 0,
      elements: arr<any>(v.elements, 8).map((e) => ({ label: str(e?.label, 200), factIds: onlyFacts(e?.factIds) })).filter((e) => e.label),
      sentences: arr<any>(v.sentences, 6).map((s) => ({ minScore: Number(s?.minScore) || 0, text: str(s?.text, 900) })).filter((s) => s.text).sort((a, b) => a.minScore - b.minScore),
      notGuiltyText: str(v.notGuiltyText, 600) || 'Members of the jury, thank you. The defendant is discharged and free to leave.',
    },
    curriculum: arr<any>(raw?.curriculum, 60).map((c) => {
      const stage = oneOf(c?.calledUponAt?.stage, ['interview', 'opening', 'witness', 'closing'] as const, 'closing');
      const characterId = charIds.has(str(c?.calledUponAt?.characterId, 40)) ? str(c?.calledUponAt?.characterId, 40) : '';
      // A witness- or interview-based trigger with no valid person cannot fire, so it falls back to the closing speech.
      const usable = (stage === 'witness' && characterId) || (stage === 'interview') || stage === 'opening';
      return { label: str(c?.label, 300), arisesWhen: str(c?.arisesWhen, 400), calledUponAt: { stage: usable ? stage : 'closing', characterId: usable && stage !== 'opening' ? characterId : '' } };
    }).filter((c) => conceptLabels.has(c.label)),
  };
}

function capResponse(res: Response, userId: string, err: unknown) {
  if (err instanceof CreateCapError) return res.status(402).json({ error: err.message, code: 'CREATE_SPEND_CAP', spend: spendSummary(userId) });
  if (err instanceof InsufficientLocksError) return res.status(402).json({ error: "You're out of Locks for now.", code: 'LOCK_LIMIT_REACHED' });
  return null;
}

// POST /playtest/compile { case, role, minutes, concepts, clientUsedUsd } -> { jobId, sessionId }
router.post('/playtest/compile', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, any>;
  const c = body.case;
  if (!c || typeof c !== 'object') return res.status(400).json({ error: 'case is required' });
  const role = body.role === 'prosecution' ? 'Prosecution' : 'Defence';
  const minutes = [15, 25, 45, 60].includes(Number(body.minutes)) ? Number(body.minutes) : 25;
  const concepts = arr<any>(body.concepts, 60).map((x) => ({ label: str(x?.label, 300), subtopic: str(x?.subtopic, 200) })).filter((x) => x.label);
  const userId = req.userId as string;
  const { coverage: _cov, ...content } = c;
  const caseText = JSON.stringify(content);
  if (caseText.length > 70000) return res.status(413).json({ error: 'case is too large' });
  try {
    if (getUsedUsd(userId, Number(body.clientUsedUsd) || undefined) >= spendSummary(userId).capUsd - 0.005) throw new CreateCapError(getUsedUsd(userId), spendSummary(userId).capUsd);
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    throw err;
  }
  sweepSessions();
  const sessionId = newSessionId();
  const jobId = startJob(userId, async () => {
    const { text } = await createAiCall({
      userId, systemPrompt: CASE_GRAPH_COMPILE_PROMPT, maxTokens: 14000, temperature: 0.4,
      userContent: JSON.stringify({ learnerRole: role, approximateMinutes: minutes, curriculumConcepts: concepts, case: JSON.parse(caseText) }),
      reason: 'playtest-compile-case-graph', cacheSystemPrompt: false, clientUsedUsd: Number(body.clientUsedUsd) || undefined,
    });
    const graph = normaliseGraph(parseModelJson<any>(text), c, concepts);
    if (graph.characters.length < 2 || graph.facts.length < 4) throw new Error('compiled graph too thin');
    sessions.set(sessionId, { userId, graph, createdAt: Date.now() });
    return { sessionId, graph };
  });
  res.json({ jobId, sessionId });
});

// POST /playtest/session { graph } -> { sessionId }   (restores a session after a restart / or for a saved case)
router.post('/playtest/session', actionEndpointLimiter, (req: Request, res: Response) => {
  const g = (req.body ?? {}).graph;
  if (!g || typeof g !== 'object' || !Array.isArray(g.characters) || !Array.isArray(g.facts)) return res.status(400).json({ error: 'graph is required' });
  if (JSON.stringify(g).length > 400000) return res.status(413).json({ error: 'graph is too large' });
  sweepSessions();
  const sessionId = newSessionId();
  // Re-validated so a hand-edited graph cannot smuggle in a shape the courtroom or the prompts do not expect.
  const graph = normaliseGraph(g, { characters: g.characters, evidence: g.evidence }, arr<any>(g.curriculum, 60).map((c) => ({ label: str(c?.label, 300) })));
  sessions.set(sessionId, { userId: req.userId as string, graph, createdAt: Date.now() });
  res.json({ sessionId });
});

const flatten = (content: unknown): string => JSON.stringify(content ?? {}).slice(0, 1800);


// What a character is told about themselves and the conversation. Built only from the server's copy of the graph.
export function buildCharacterInput(graph: any, ch: any, b: Record<string, any>, message: string) {
  const setting = b.setting === 'interview' ? 'interview' : 'court';
  const asking = b.asking === 'prosecution' ? 'prosecution' : 'defence';
  const factById = new Map<string, any>(graph.facts.map((f: any) => [f.id, f]));
  const evById = new Map<string, any>(graph.evidence.map((e: any) => [e.id, e]));
  const shownIds = arr<string>(b.presentedEvidenceIds, 30).map((x) => str(x, 40)).filter((x) => evById.has(x));
  // Several exhibits can be put to a witness at once (presentedEvidenceIdsNow); the single-id form still works.
  const nowIds = arr<string>(b.presentedEvidenceIdsNow, 8).map((x) => str(x, 40)).filter((x) => evById.has(x));
  const legacyId = str(b.presentedEvidenceId, 40);
  if (legacyId && evById.has(legacyId) && !nowIds.includes(legacyId)) nowIds.push(legacyId);
  nowIds.forEach((id) => { if (!shownIds.includes(id)) shownIds.push(id); });
  const history = arr<any>(b.history, 30).slice(-10).map((h) => ({ from: h?.from === 'them' ? 'you' : 'the barrister', text: str(h?.text, 700) }));
  const userContent = JSON.stringify({
    you: { name: ch.name, role: ch.role, demeanour: ch.demeanour, howYouSpeak: ch.speech },
    setting: setting === 'interview'
      ? `A private conference. The barrister speaking to you acts for the ${ch.side === 'prosecution' ? 'prosecution' : 'defence'}: they are on your side.`
      : `You are in the witness box in the Crown Court. The barrister questioning you now acts for the ${asking}.`,
    theBarrister: setting === 'interview'
      ? { role: `your own barrister (counsel for the ${ch.side === 'prosecution' ? 'prosecution' : 'defence'})`, name: str(b.counselName, 80) || undefined }
      : { role: `counsel for the ${asking} (a barrister, not a witness)`, name: str(b.counselName, 80) || undefined },
    whatYouKnow: ch.mind.knows.map((id: string) => ({ id, text: factById.get(id)?.text })),
    whatYouAreConcealing: ch.mind.concealing.map((id: string) => ({ id, text: factById.get(id)?.text })),
    theLieYouTell: ch.mind.lieDetails,
    whatYouBelieve: ch.mind.believes,
    whatYouRemember: ch.mind.remembers,
    yourGaps: ch.mind.gaps,
    reliability: ch.mind.reliability,
    honesty: ch.mind.honesty,
    candourWithYourOwnLawyer: ch.mind.candourWithOwnCounsel,
    evidenceShownSoFar: shownIds.filter((id) => !nowIds.includes(id)).map((id) => evById.get(id)?.title),
    evidenceJustPutToYou: nowIds.length ? nowIds.map((id) => { const e = evById.get(id); return { title: e.title, kind: e.kind, content: flatten(e.content), bearsOnFactIds: e.factIds }; }) : null,
    conversationSoFar: history,
    latestQuestion: message,
  });
  return { userContent, shownIds };
}

// Deterministic guard: a character can only reveal what they know, and a concealed fact only once evidence that
// bears on it has actually been put to them.
export function guardRevealed(graph: any, ch: any, shownIds: string[], ids: unknown): string[] {
  const evById = new Map<string, any>(graph.evidence.map((e: any) => [e.id, e]));
  const concealed = new Set<string>(ch.mind.concealing);
  const allowedByEvidence = new Set<string>(shownIds.flatMap((id) => evById.get(id)?.factIds || []));
  return arr<string>(ids, 20).map((x) => str(x, 20)).filter((id) => ch.mind.knows.includes(id) && (!concealed.has(id) || allowedByEvidence.has(id)));
}

// POST /playtest/character-turn -> { reply, revealedFactIds, judgeNote, spend }
router.post('/playtest/character-turn', actionEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const userId = req.userId as string;
  const session = sessions.get(str(b.sessionId, 40));
  if (!session || session.userId !== userId) return res.status(409).json({ error: 'session expired', code: 'SESSION_EXPIRED' });
  const graph = session.graph;
  const ch = graph.characters.find((c: any) => c.id === str(b.characterId, 40));
  const message = str(b.message, 1200);
  if (!ch || !message) return res.status(400).json({ error: 'characterId and message are required' });
  const { userContent, shownIds } = buildCharacterInput(graph, ch, b, message);
  try {
    const { text, spend } = await createAiCall({
      userId, systemPrompt: CHARACTER_TURN_PROMPT, userContent, maxTokens: 500, temperature: 0.7,
      reason: 'playtest-character-turn', cacheSystemPrompt: false, clientUsedUsd: Number(b.clientUsedUsd) || undefined,
    });
    const parsed = parseModelJson<any>(text);
    const revealed = guardRevealed(graph, ch, shownIds, parsed?.revealedFactIds);
    res.json({ reply: str(parsed?.reply, 1200) || "I'm sorry, could you repeat that?", revealedFactIds: revealed, judgeNote: str(parsed?.judgeNote, 300) || null, spend });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Playtest character turn failed:', err);
    res.status(500).json({ error: 'The character could not answer just now - please try again.' });
  }
});

// POST /playtest/assess { sessionId, opening, closing, exchanges, evidencePresented, establishedFactIds, side } -> { jobId }
router.post('/playtest/assess', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const userId = req.userId as string;
  const session = sessions.get(str(b.sessionId, 40));
  if (!session || session.userId !== userId) return res.status(409).json({ error: 'session expired', code: 'SESSION_EXPIRED' });
  const graph = session.graph;
  try {
    if (getUsedUsd(userId, Number(b.clientUsedUsd) || undefined) >= spendSummary(userId).capUsd - 0.005) throw new CreateCapError(getUsedUsd(userId), spendSummary(userId).capUsd);
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    throw err;
  }
  const concepts = graph.curriculum.map((c: any) => ({ label: c.label, arisesWhen: c.arisesWhen }));
  const heard = new Set<string>(arr<string>(b.establishedFactIds, 60).map((x) => str(x, 20)));
  const input = {
    selectedConcepts: concepts,
    learnerSide: b.side === 'prosecution' ? 'Prosecution' : 'Defence',
    factsOfTheCase: graph.facts.map((f: any) => ({ id: f.id, text: f.text, favours: f.favours })),
    factsTheCourtHeard: [...heard],
    evidence: graph.evidence.map((e: any) => ({ id: e.id, title: e.title })),
    whatTheLearnerDid: {
      openingSpeech: str(b.opening, 4000),
      questionsPutToWitnesses: arr<any>(b.exchanges, 80).map((x) => ({ witness: str(x?.character, 120), question: str(x?.question, 500), evidencePut: str(x?.evidence, 200) || undefined })),
      closingSpeech: str(b.closing, 8000),
    },
  };
  const jobId = startJob(userId, async () => {
    const { text } = await createAiCall({
      userId, systemPrompt: CLOSING_ASSESSMENT_PROMPT, userContent: JSON.stringify(input), maxTokens: 2600, temperature: 0.3,
      reason: 'playtest-assess', cacheSystemPrompt: false, clientUsedUsd: Number(b.clientUsedUsd) || undefined,
    });
    const p = parseModelJson<any>(text);
    const byLabel = new Map<string, any>(arr<any>(p?.nodes, 80).map((n) => [str(n?.label, 300), n]));
    return {
      persuasion: Math.max(-1, Math.min(1, Number(p?.persuasion) || 0)),
      summary: str(p?.summary, 900),
      strengths: arr<string>(p?.strengths, 6).map((x) => str(x, 300)).filter(Boolean),
      improvements: arr<string>(p?.improvements, 6).map((x) => str(x, 300)).filter(Boolean),
      // One row per selected concept, whatever the model returned.
      nodes: concepts.map((c: any) => {
        const n = byLabel.get(c.label);
        return { label: c.label, rating: oneOf(n?.rating, ['strong', 'developing', 'needs_work', 'not_shown'] as const, 'not_shown'), comment: str(n?.comment, 500), quote: str(n?.quote, 300) };
      }),
    };
  });
  res.json({ jobId });
});

// POST /playtest/compile-speech { sessionId, kind: 'opening'|'closing', side, notes, establishedFactIds } -> { speech, tips }
// A writing aid for advocacy: turns the learner's own quick notes into a polished courtroom speech. It adds no points of its own.
router.post('/playtest/compile-speech', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, any>;
  const userId = req.userId as string;
  const session = sessions.get(str(b.sessionId, 40));
  if (!session || session.userId !== userId) return res.status(409).json({ error: 'session expired', code: 'SESSION_EXPIRED' });
  const notes = str(b.notes, 3000);
  if (notes.split(/\s+/).filter(Boolean).length < 5) return res.status(400).json({ error: 'Jot down at least a few points first.' });
  const graph = session.graph;
  const kind = b.kind === 'closing' ? 'closing' : 'opening';
  const side = b.side === 'prosecution' ? 'prosecution' : 'defence';
  const heard = new Set<string>(arr<string>(b.establishedFactIds, 60).map((x) => str(x, 20)));
  const input = {
    speech: kind, youAreCounselFor: side,
    theTraineesNotes: notes,
    caseSummary: str(graph.caseFile?.summary, 900),
    agreedFacts: arr<string>(graph.caseFile?.agreedFacts, 12).map((x) => str(x, 300)),
    factsTheCourtHasHeard: kind === 'closing' ? graph.facts.filter((f: any) => heard.has(f.id)).map((f: any) => f.text) : undefined,
  };
  try {
    const { text, spend } = await createAiCall({
      userId, systemPrompt: COMPILE_SPEECH_PROMPT, userContent: JSON.stringify(input), maxTokens: 1100, temperature: 0.5,
      reason: 'playtest-compile-speech', cacheSystemPrompt: false, clientUsedUsd: Number(b.clientUsedUsd) || undefined,
    });
    const p = parseModelJson<any>(text);
    const speech = str(p?.speech, 4500);
    if (!speech) return res.status(502).json({ error: 'Cortex could not write that up - please try again.' });
    res.json({ speech, tips: arr<string>(p?.tips, 3).map((x) => str(x, 300)).filter(Boolean), spend });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Playtest compile-speech failed:', err);
    res.status(500).json({ error: 'Cortex could not write that up just now - please try again.' });
  }
});

// POST /playtest/portrait { description } -> { image: data URL, transparent } | 501 when no image key is set
// One canonical waist-up figure per character, generated once and kept with the case so a person always looks like the same person.
// Several candidates are made and a quick vision check keeps one whose clothing faces the camera (see services/createImages.ts).
router.post('/playtest/portrait', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const key = process.env.FAL_KEY;
  if (!key) return res.status(501).json({ error: 'portraits not configured' });
  const userId = req.userId as string;
  const description = str((req.body ?? {}).description, 500);
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    assertCanSpend(userId, 0.06, Number((req.body ?? {}).clientUsedUsd) || undefined);
    const fig = await generatePortraitCutout(key, description, userId);
    recordSpend(userId, fig.costUsd);
    res.json({ image: await downloadAsDataUrl(fig.url, fig.transparent), transparent: fig.transparent, usable: fig.usable, spend: spendSummary(userId) });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Playtest portrait failed:', err);
    res.status(502).json({ error: 'portrait unavailable' });
  }
});

// POST /playtest/evidence-image { kind, description } -> { image: data URL, matched }
// A picture for CCTV, photographs and physical exhibits, checked against what the exhibit is described as showing.
router.post('/playtest/evidence-image', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const key = process.env.FAL_KEY;
  if (!key) return res.status(501).json({ error: 'images not configured' });
  const userId = req.userId as string;
  const kind = oneOf((req.body ?? {}).kind, ['cctv', 'photo', 'physical'] as const, 'photo');
  const description = str((req.body ?? {}).description, 700);
  if (!description) return res.status(400).json({ error: 'description is required' });
  try {
    assertCanSpend(userId, 0.05, Number((req.body ?? {}).clientUsedUsd) || undefined);
    const pic = await generateEvidencePicture(key, kind, description, userId);
    recordSpend(userId, pic.costUsd);
    res.json({ image: await downloadAsDataUrl(pic.url, false), matched: pic.matched, spend: spendSummary(userId) });
  } catch (err) {
    const handled = capResponse(res, userId, err);
    if (handled) return handled;
    console.error('Playtest evidence picture failed:', err);
    res.status(502).json({ error: 'picture unavailable' });
  }
});

export default router;
