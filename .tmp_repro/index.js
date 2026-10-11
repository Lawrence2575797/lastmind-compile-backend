"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const compile_1 = __importDefault(require("./routes/compile"));
const review_1 = __importDefault(require("./routes/review"));
const chains_1 = __importDefault(require("./routes/chains"));
const diagnostics_1 = __importDefault(require("./routes/diagnostics"));
const chainLesson_1 = __importDefault(require("./routes/chainLesson"));
const cortex_1 = __importDefault(require("./routes/cortex"));
const encodingLesson_1 = __importDefault(require("./routes/encodingLesson"));
const rateLimiters_1 = require("./services/rateLimiters");
const PORT = process.env.PORT || 4100;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://your-domain.example';
const app = (0, express_1.default)();
// Render sits behind its own proxy, so every request arrives with an
// X-Forwarded-For header. Without this, express-rate-limit's validation
// rejects every single request outright — this isn't optional tuning,
// it's required for the rate limiter to work at all in this environment.
// '1' means "trust exactly one hop" (Render's own proxy) — deliberately
// not `true`, which would trust the whole header including anything a
// malicious client could forge onto it.
app.set('trust proxy', 1);
app.use(express_1.default.json({ limit: '200kb' }));
app.use((0, cors_1.default)({ origin: FRONTEND_ORIGIN, methods: ['POST', 'GET'] }));
app.use(rateLimiters_1.globalRateLimiter);
app.use('/', compile_1.default);
app.use('/', review_1.default);
app.use('/', chains_1.default);
app.use('/', diagnostics_1.default);
app.use('/', chainLesson_1.default);
app.use('/', cortex_1.default);
app.use('/', encodingLesson_1.default);
app.get('/health', (_req, res) => res.send('ok'));
app.listen(PORT, () => {
    console.log(`LastMind compile backend listening on :${PORT}`);
});
