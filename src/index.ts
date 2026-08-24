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
import onboardingRouter from './routes/onboarding';
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
app.use('/', onboardingRouter);

app.get('/health', (_req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`LastMind compile backend listening on :${PORT}, commit ${process.env.RENDER_GIT_COMMIT || 'unknown'}`);
});
