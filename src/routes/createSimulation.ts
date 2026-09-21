import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../services/authMiddleware';
import { costlyEndpointLimiter, syncEndpointLimiter } from '../services/rateLimiters';
import { createAiCall } from '../services/createAi';
import { CreateCapError, getUsedUsd, setUsedUsd, spendSummary } from '../services/createSpend';
import { parseModelJson } from '../services/jsonParsing';
import { InsufficientLocksError, assertLocksAvailable } from '../services/lockService';
import { CRIMINAL_TRIAL_BUILD_PROMPT, CRIMINAL_TRIAL_VALIDATE_PROMPT, CRIMINAL_TRIAL_APPLY_FIXES_PROMPT } from '../constants/createSimulationPrompts';

const router = Router();
router.use('/create', requireAuth);

// Building or checking a whole case is one long Claude call (tens of seconds), longer than is safe to hold
// an HTTP request open through a proxy. So each is run as a job: POST starts it and returns an id at once,
// the page polls GET for the result. Jobs live in memory (a restart mid-job just makes the page offer a retry).
interface Job { userId: string; status: 'running' | 'done' | 'error'; result?: unknown; error?: string; code?: string; createdAt: number; spend?: { usedUsd: number; capUsd: number } }
const jobs = new Map<string, Job>();
const JOB_TTL_MS = 30 * 60 * 1000;
function sweepJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
}

export function startJob(userId: string, work: () => Promise<unknown>): string {
  sweepJobs();
  const id = crypto.randomBytes(12).toString('hex');
  const job: Job = { userId, status: 'running', createdAt: Date.now() };
  jobs.set(id, job);
  work().then(
    (result) => { job.status = 'done'; job.result = result; job.spend = spendSummary(userId); },
    (err) => {
      job.status = 'error';
      job.spend = spendSummary(userId);
      if (err instanceof CreateCapError) { job.error = err.message; job.code = 'CREATE_SPEND_CAP'; }
      else if (err instanceof InsufficientLocksError) { job.error = "You're out of Locks for now."; job.code = 'LOCK_LIMIT_REACHED'; }
      else { console.error('Create simulation job failed:', err); job.error = 'Cortex could not finish this - please try again.'; }
    }
  );
  return id;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const uid = () => crypto.randomBytes(6).toString('hex');
const arr = <T>(v: unknown, cap: number): T[] => (Array.isArray(v) ? (v.slice(0, cap) as T[]) : []);

interface ConceptInput { label: string; subtopic: string }
function cleanConcepts(v: unknown): ConceptInput[] {
  return arr<Record<string, unknown>>(v, 60)
    .map((c) => ({ label: str(c?.label, 300), subtopic: str(c?.subtopic, 200) }))
    .filter((c) => c.label);
}

function normaliseCoverage(raw: any, concepts: ConceptInput[]) {
  const stars = Math.min(5, Math.max(1, Math.round(Number(raw?.stars) || 1)));
  const byLabel = new Map<string, any>();
  arr<any>(raw?.concepts, 80).forEach((c) => byLabel.set(str(c?.label, 300), c));
  return {
    stars,
    summary: str(raw?.summary, 400),
    // Always one row per selected concept, in the order chosen, whatever the model returned.
    concepts: concepts.map((c) => {
      const m = byLabel.get(c.label);
      const covered = ['fully', 'partly', 'not'].includes(str(m?.covered, 10)) ? str(m?.covered, 10) : 'not';
      return { label: c.label, covered, how: str(m?.how, 400) };
    }),
  };
}

function normaliseCase(raw: any, concepts: ConceptInput[], keepIds = false) {
  const idOf = (x: any) => (keepIds && typeof x?.id === 'string' && x.id.trim() ? x.id.trim().slice(0, 40) : uid());
  const o = raw?.overview || {};
  return {
    title: str(raw?.title, 120) || 'Untitled case',
    overview: {
      summary: str(o.summary, 1200),
      whatHappened: str(o.whatHappened, 4000),
      charge: str(o.charge, 800),
      prosecutionCase: str(o.prosecutionCase, 2000),
      defenceCase: str(o.defenceCase, 2000),
      studentBriefing: str(o.studentBriefing, 1200),
    },
    timeline: arr<any>(raw?.timeline, 30).map((t) => ({ id: idOf(t), time: str(t?.time, 120), event: str(t?.event, 800), knownTo: str(t?.knownTo, 300) })),
    characters: arr<any>(raw?.characters, 14).map((c) => ({
      id: idOf(c), name: str(c?.name, 120), role: str(c?.role, 120), description: str(c?.description, 800),
      whatTheySaw: str(c?.whatTheySaw, 1200), stance: str(c?.stance, 1200),
      honesty: ['truthful', 'mistaken', 'lying'].includes(str(c?.honesty, 12)) ? str(c?.honesty, 12) : 'truthful',
      honestyNote: str(c?.honestyNote, 600),
    })),
    evidence: arr<any>(raw?.evidence, 16).map((e) => ({
      id: idOf(e), name: str(e?.name, 160), type: str(e?.type, 80), description: str(e?.description, 800),
      whatItShows: str(e?.whatItShows, 800), weakness: str(e?.weakness, 800),
      favours: ['prosecution', 'defence', 'neutral'].includes(str(e?.favours, 12)) ? str(e?.favours, 12) : 'neutral',
    })),
    legalIssues: arr<any>(raw?.legalIssues, 10).map((l) => ({
      id: idOf(l), issue: str(l?.issue, 300), law: str(l?.law, 1200), howItArises: str(l?.howItArises, 1000), keyQuestion: str(l?.keyQuestion, 500),
    })),
    coverage: normaliseCoverage(raw?.coverage, concepts),
  };
}

// POST /create/criminal-trial/build -> { jobId }
router.post('/create/criminal-trial/build', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, any>;
  const role = body.role === 'prosecution' ? 'prosecution' : body.role === 'defence' ? 'defence' : null;
  const minutes = [15, 25, 45, 60].includes(Number(body.minutes)) ? Number(body.minutes) : null;
  if (!role || !minutes) return res.status(400).json({ error: 'role and minutes are required' });
  const concepts = cleanConcepts(body.concepts);
  if (!concepts.length) return res.status(400).json({ error: 'select at least one concept' });
  const userId = req.userId as string;
  try {
    await assertLocksAvailable(userId);
    if (getUsedUsd(userId, Number(body.clientUsedUsd) || undefined) >= spendSummary(userId).capUsd - 0.005) throw new CreateCapError(getUsedUsd(userId), spendSummary(userId).capUsd);
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED' });
    if (err instanceof CreateCapError) return res.status(402).json({ error: err.message, code: 'CREATE_SPEND_CAP', spend: spendSummary(userId) });
    throw err;
  }
  const details = body.details && typeof body.details === 'object' ? body.details : {};
  const input = {
    studentRole: role === 'defence' ? 'Defence' : 'Prosecution',
    approximateMinutes: minutes,
    curriculumConcepts: concepts,
    idea: str(body.idea, 3000),
    cortexDecidesDetails: !!body.cortexDecides,
    details: {
      desiredCharacters: str(details.characters, 1500),
      setting: str(details.setting, 1500),
      tone: str(details.tone, 1500),
      specificEvidence: str(details.evidence, 1500),
      twists: str(details.twists, 1500),
    },
  };
  const jobId = startJob(userId, async () => {
    const { text: raw } = await createAiCall({
      userId, systemPrompt: CRIMINAL_TRIAL_BUILD_PROMPT, userContent: JSON.stringify(input), maxTokens: 9000, temperature: 0.8,
      reason: 'create-criminal-trial-build', clientUsedUsd: Number(body.clientUsedUsd) || undefined,
    });
    return normaliseCase(parseModelJson<any>(raw), concepts);
  });
  res.json({ jobId });
});

// POST /create/criminal-trial/validate -> { jobId }
router.post('/create/criminal-trial/validate', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, any>;
  const c = body.case;
  if (!c || typeof c !== 'object') return res.status(400).json({ error: 'case is required' });
  const concepts = cleanConcepts(body.concepts);
  const role = body.role === 'prosecution' ? 'Prosecution' : 'Defence';
  const minutes = [15, 25, 45, 60].includes(Number(body.minutes)) ? Number(body.minutes) : 25;
  const userId = req.userId as string;
  try {
    await assertLocksAvailable(userId);
    if (getUsedUsd(userId, Number(body.clientUsedUsd) || undefined) >= spendSummary(userId).capUsd - 0.005) throw new CreateCapError(getUsedUsd(userId), spendSummary(userId).capUsd);
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED' });
    if (err instanceof CreateCapError) return res.status(402).json({ error: err.message, code: 'CREATE_SPEND_CAP', spend: spendSummary(userId) });
    throw err;
  }
  // Only the case content goes to Cortex (ids and the old coverage rating are dropped).
  const { coverage: _old, ...content } = c;
  const caseText = JSON.stringify(content, (k, v) => (k === 'id' ? undefined : v));
  if (caseText.length > 60000) return res.status(413).json({ error: 'case is too large' });
  const jobId = startJob(userId, async () => {
    const { text: raw } = await createAiCall({
      userId, systemPrompt: CRIMINAL_TRIAL_VALIDATE_PROMPT,
      userContent: JSON.stringify({ studentRole: role, approximateMinutes: minutes, curriculumConcepts: concepts, case: JSON.parse(caseText) }),
      maxTokens: 3500, temperature: 0.2, reason: 'create-criminal-trial-validate', clientUsedUsd: Number(body.clientUsedUsd) || undefined,
    });
    const parsed = parseModelJson<any>(raw);
    const issues = arr<any>(parsed?.issues, 30).map((i) => ({
      area: str(i?.area, 40), severity: str(i?.severity, 10) === 'blocker' ? 'blocker' : 'warning',
      message: str(i?.message, 600), suggestion: str(i?.suggestion, 600),
    })).filter((i) => i.message);
    return {
      workable: !issues.some((i) => i.severity === 'blocker'),
      summary: str(parsed?.summary, 600),
      issues,
      coverage: normaliseCoverage(parsed?.coverage, concepts),
    };
  });
  res.json({ jobId });
});

// POST /create/criminal-trial/apply-fixes { case, issues, role, minutes, concepts } -> { jobId }
// Applies one suggestion, or all of them at once, to the case. Returns only the sections that changed, plus a plain list of what was changed.
router.post('/create/criminal-trial/apply-fixes', costlyEndpointLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, any>;
  const c = body.case;
  if (!c || typeof c !== 'object') return res.status(400).json({ error: 'case is required' });
  const issues = arr<any>(body.issues, 20).map((i) => ({ area: str(i?.area, 40), message: str(i?.message, 600), suggestion: str(i?.suggestion, 600) })).filter((i) => i.message);
  if (!issues.length) return res.status(400).json({ error: 'at least one issue is required' });
  const concepts = cleanConcepts(body.concepts);
  const userId = req.userId as string;
  try {
    await assertLocksAvailable(userId);
    if (getUsedUsd(userId, Number(body.clientUsedUsd) || undefined) >= spendSummary(userId).capUsd - 0.005) throw new CreateCapError(getUsedUsd(userId), spendSummary(userId).capUsd);
  } catch (err) {
    if (err instanceof InsufficientLocksError) return res.status(402).json({ error: 'Lock limit reached', code: 'LOCK_LIMIT_REACHED' });
    if (err instanceof CreateCapError) return res.status(402).json({ error: err.message, code: 'CREATE_SPEND_CAP', spend: spendSummary(userId) });
    throw err;
  }
  const { coverage: _cov, ...content } = c;
  const caseText = JSON.stringify(content);
  if (caseText.length > 60000) return res.status(413).json({ error: 'case is too large' });
  const jobId = startJob(userId, async () => {
    const { text: raw } = await createAiCall({
      userId, systemPrompt: CRIMINAL_TRIAL_APPLY_FIXES_PROMPT, userContent: JSON.stringify({ case: JSON.parse(caseText), issues }),
      maxTokens: 8000, temperature: 0.2, reason: 'create-criminal-trial-apply-fixes', clientUsedUsd: Number(body.clientUsedUsd) || undefined,
    });
    const parsed = parseModelJson<any>(raw);
    // Merge the returned sections over the current case, normalise (keeping ids), and hand back only what changed.
    const merged = normaliseCase({ ...content, ...parsed, coverage: undefined }, concepts, true);
    const out: Record<string, unknown> = {};
    for (const key of ['overview', 'timeline', 'characters', 'evidence', 'legalIssues'] as const) {
      if (parsed && parsed[key] !== undefined) out[key] = (merged as any)[key];
    }
    return { sections: out, changes: arr<string>(parsed?.changes, 10).map((x) => str(x, 300)).filter(Boolean) };
  });
  res.json({ jobId });
});

// GET /create/jobs/:id -> { status: 'running' } | { status: 'done', result } | { status: 'error', error, code? }
router.get('/create/jobs/:id', syncEndpointLimiter, (req: Request, res: Response) => {
  const job = jobs.get(req.params.id);
  if (!job || job.userId !== req.userId) return res.status(404).json({ error: 'job not found' });
  if (job.status === 'running') return res.json({ status: 'running' });
  if (job.status === 'error') return res.json({ status: 'error', error: job.error, code: job.code, spend: job.spend });
  res.json({ status: 'done', result: job.result, spend: job.spend });
});

// GET /create/spend?used=<what the page last saw> -> { usedUsd, capUsd }
router.get('/create/spend', syncEndpointLimiter, (req: Request, res: Response) => {
  getUsedUsd(req.userId as string, Number(req.query.used) || undefined);
  res.json(spendSummary(req.userId as string));
});

// POST /create/spend/set { usedUsd } -> { usedUsd, capUsd }: switches the running total to the case now being worked on.
router.post('/create/spend/set', syncEndpointLimiter, (req: Request, res: Response) => {
  setUsedUsd(req.userId as string, Number((req.body ?? {}).usedUsd));
  res.json(spendSummary(req.userId as string));
});

export default router;
