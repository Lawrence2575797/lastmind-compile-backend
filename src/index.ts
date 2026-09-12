import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
// Peer-to-peer student tutoring (opt-in, matching, request/response,
// ratings) is not currently offered - these four routers are deliberately
// unmounted below rather than deleted, so the feature can be turned back
// on later by uncommenting these lines and the matching app.use() calls,
// without rebuilding it from scratch. Not touching tutoringSlots - that's
// the separate "book 1:1 time with the founder" feature, still live.
// import tutoringProfileRouter from './routes/tutoringProfile';
// import peerTutoringRouter from './routes/peerTutoring';
// import tutoringSessionsRouter from './routes/tutoringSessions';
// import tutoringResponsesRouter from './routes/tutoringResponses';
import studySettingsRouter from './routes/studySettings';
import revisionPlanRouter from './routes/revisionPlan';
import creditsRouter from './routes/credits';
import locksRouter from './routes/locks';
import rewardsRouter from './routes/rewards';
import adminRouter from './routes/admin';
import verificationRouter from './routes/verification';
import onboardingRouter from './routes/onboarding';
import rewardSubmissionsRouter from './routes/rewardSubmissions';
import practiceQuestionsRouter from './routes/practiceQuestions';
import examPrepCorrectionsRouter from './routes/examPrepCorrections';
import accountDeletionRouter from './routes/accountDeletion';
import specLessonPlanRouter from './routes/specLessonPlan';
import specLessonPracticeRouter from './routes/specLessonPractice';
import mathHelpRouter from './routes/mathHelp';
import personalNotesRouter from './routes/personalNotes';
import themeSettingsRouter from './routes/themeSettings';
import objectiveCourseRouter from './routes/objectiveCourse';
import ttsRouter from './routes/tts';
import tutoringSlotsRouter from './routes/tutoringSlots';
import { globalRateLimiter } from './services/rateLimiters';
import { startRetentionScheduler } from './services/retentionService';

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

// Standard security headers (X-Content-Type-Options, no X-Powered-By,
// etc.) — this is a JSON API with no HTML views of its own, so helmet's
// CSP defaults (meant for pages that render markup) are switched off
// rather than fought against.
app.use(helmet({ contentSecurityPolicy: false }));
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
// tutoringProfileRouter / peerTutoringRouter / tutoringSessionsRouter /
// tutoringResponsesRouter deliberately not mounted - see their commented-
// out imports above.
app.use('/', studySettingsRouter);
app.use('/', revisionPlanRouter);
app.use('/', creditsRouter);
app.use('/', locksRouter);
app.use('/', rewardsRouter);
app.use('/', adminRouter);
app.use('/', verificationRouter);
app.use('/', onboardingRouter);
app.use('/', rewardSubmissionsRouter);
app.use('/', practiceQuestionsRouter);
app.use('/', examPrepCorrectionsRouter);
app.use('/', accountDeletionRouter);
app.use('/', specLessonPlanRouter);
app.use('/', specLessonPracticeRouter);
app.use('/', mathHelpRouter);
app.use('/', personalNotesRouter);
app.use('/', themeSettingsRouter);
app.use('/', objectiveCourseRouter);
app.use('/', ttsRouter);
app.use('/', tutoringSlotsRouter);

app.get('/health', (_req, res) => res.send('ok'));

startRetentionScheduler();

app.listen(PORT, () => {
  console.log(`LastMind compile backend listening on :${PORT}, commit ${process.env.RENDER_GIT_COMMIT || 'unknown'}`);
});
