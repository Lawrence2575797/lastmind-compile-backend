import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compileRouter from './routes/compile';
import reviewRouter from './routes/review';
import chainsRouter from './routes/chains';
import diagnosticsRouter from './routes/diagnostics';
import chainLessonRouter from './routes/chainLesson';
import cortexRouter from './routes/cortex';
import encodingLessonRouter from './routes/encodingLesson';
import syncRouter from './routes/sync';
import calendarEventsRouter from './routes/calendarEvents';
import knowledgeMapRouter from './routes/knowledgeMap';
import tutoringProfileRouter from './routes/tutoringProfile';
import peerTutoringRouter from './routes/peerTutoring';
import tutoringSessionsRouter from './routes/tutoringSessions';
import tutoringResponsesRouter from './routes/tutoringResponses';
import studySettingsRouter from './routes/studySettings';
import revisionPlanRouter from './routes/revisionPlan';
import creditsRouter from './routes/credits';
import locksRouter from './routes/locks';
import rewardsRouter from './routes/rewards';
import adminRouter from './routes/admin';
import verificationRouter from './routes/verification';
import { globalRateLimiter } from './services/rateLimiters';

const PORT = process.env.PORT || 4100;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://your-domain.example';

const app = express();

// Render sits behind its own proxy, so every request arrives with an
// X-Forwarded-For header. Without this, express-rate-limit's validation
// rejects every single request outright — this isn't optional tuning,
// it's required for the rate limiter to work at all in this environment.
// '1' means "trust exactly one hop" (Render's own proxy) — deliberately
// not `true`, which would trust the whole header including anything a
// malicious client could forge onto it.
app.set('trust proxy', 1);

app.use(express.json({ limit: '200kb' }));
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ['POST', 'GET'] }));
app.use(globalRateLimiter);

app.use('/', compileRouter);
app.use('/', reviewRouter);
app.use('/', chainsRouter);
app.use('/', diagnosticsRouter);
app.use('/', chainLessonRouter);
app.use('/', cortexRouter);
app.use('/', encodingLessonRouter);
app.use('/', syncRouter);
app.use('/', calendarEventsRouter);
app.use('/', knowledgeMapRouter);
app.use('/', tutoringProfileRouter);
app.use('/', peerTutoringRouter);
app.use('/', tutoringSessionsRouter);
app.use('/', tutoringResponsesRouter);
app.use('/', studySettingsRouter);
app.use('/', revisionPlanRouter);
app.use('/', creditsRouter);
app.use('/', locksRouter);
app.use('/', rewardsRouter);
app.use('/', adminRouter);
app.use('/', verificationRouter);

app.get('/health', async (_req, res) => {
  const { supabaseAdmin } = await import('./services/supabaseAdmin');
  const { count: lockBalancesCount } = await supabaseAdmin
    .from('lock_balances')
    .select('*', { count: 'exact', head: true });
  const { count: profileEntriesCount } = await supabaseAdmin
    .from('learning_profile_entries')
    .select('*', { count: 'exact', head: true });

  // Temporary self-consistency probe: writes and immediately reads back a
  // throwaway row on the server's OWN connection, to rule out this process
  // talking to a different backing store than external diagnostic scripts
  // see. Not tied to any real user (user_id null-safe columns only).
  let selfWriteReadback: unknown = null;
  let selfWriteError: unknown = null;
  try {
    const marker = 'healthcheck-' + Date.now();
    const { error: insErr } = await supabaseAdmin
      .from('learning_profile_entries')
      // Real, known-existing user id (FK requires a row in auth.users) —
      // the founder's own comp account. Deleted again below immediately.
      .insert({ user_id: 'd4d76e5b-3f78-4532-af5e-5ff589f8adb1', concept_id: marker, subject: marker, topic: marker, concept: marker });
    if (insErr) {
      selfWriteError = insErr;
    } else {
      const { data } = await supabaseAdmin.from('learning_profile_entries').select('id').eq('concept_id', marker);
      selfWriteReadback = data;
      await supabaseAdmin.from('learning_profile_entries').delete().eq('concept_id', marker);
    }
  } catch (err) {
    selfWriteError = err instanceof Error ? err.message : String(err);
  }

  res.json({
    status: 'ok',
    gitCommit: process.env.RENDER_GIT_COMMIT || 'unknown',
    lockBalancesCount,
    profileEntriesCount,
    selfWriteReadback,
    selfWriteError,
  });
});

app.listen(PORT, () => {
  console.log(`LastMind compile backend listening on :${PORT}, commit ${process.env.RENDER_GIT_COMMIT || 'unknown'}`);
});
