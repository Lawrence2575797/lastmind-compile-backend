import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compileRouter from './routes/compile';
import reviewRouter from './routes/review';
import chainsRouter from './routes/chains';

const PORT = process.env.PORT || 4100;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://your-domain.example';

const app = express();

app.use(express.json({ limit: '200kb' }));
app.use(cors({ origin: FRONTEND_ORIGIN, methods: ['POST', 'GET'] }));

app.use('/', compileRouter);
app.use('/', reviewRouter);
app.use('/', chainsRouter);

app.get('/health', (_req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`LastMind compile backend listening on :${PORT}`);
});
