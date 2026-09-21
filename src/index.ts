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
import createSimulationRouter from './routes/createSimulation';
import playtestRouter from './routes/playtest';
import createProjectsRouter from './routes/createProjects';
import chancellorRouter from './routes/chancellor';
import { screenRequestBody } from './services/contentFilter';
// Peer-to-peer student tutoring (opt-in, matching, request/response, ratings).
import tutoringProfileRouter from './routes/tutoringProfile';
import peerTutoringRouter from './routes/peerTutoring';
import tutoringSessionsRouter from './routes/tutoringSessions';
import tutoringResponsesRouter from './routes/tutoringResponses';
import studySettingsRouter from './routes/studySettings';
import revisionPlanRouter from './routes/revisionPlan';
import locksRouter from './routes/locks';
import adminRouter from './routes/admin';
import verificationRouter from './routes/verification';
import onboardingRouter from './routes/onboarding';
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
import encouragementRouter from './routes/encouragement';
import weeklyProgressReportRouter from './routes/weeklyProgressReport';
import economicsDiagramsRouter from './routes/economicsDiagrams';
import keysRouter from './routes/keys';
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
// A synced subject folder carries the student's whole prior-coverage list (one
// concept id per concept they marked as already covered - over 130 KB for
// Economics or Maths on its own) plus the lesson plan, so it needs a far larger
// body than the 200 KB used elsewhere. This parser must come first: once a body
// has been read, the global one below skips it.
app.use('/sync/folders', express.json({ limit: '3mb' }));
app.use('/create/projects', express.json({ limit: '6mb' }));
app.use('/playtest/session', express.json({ limit: '1mb' }));
app.use('/playtest/duel/create', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '200kb' }));
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(globalRateLimiter);
app.use(['/create', '/playtest', '/chancellor'], screenRequestBody);   // vulgar-language block and PII redaction on everything students type into Create, the Law playtest and the Chancellor sim

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
app.use('/', locksRouter);
app.use('/', adminRouter);
app.use('/', verificationRouter);
app.use('/', onboardingRouter);
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
app.use('/', encouragementRouter);
app.use('/', weeklyProgressReportRouter);
app.use('/', economicsDiagramsRouter);
app.use('/', createSimulationRouter);
app.use('/', playtestRouter);
app.use('/', createProjectsRouter);
app.use('/', chancellorRouter);
app.use('/', keysRouter);

app.get('/health', (_req, res) => res.send('ok'));

startRetentionScheduler();

app.listen(PORT, () => {
  console.log(`LastMind compile backend listening on :${PORT}, commit ${process.env.RENDER_GIT_COMMIT || 'unknown'}`);
});
