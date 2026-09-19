import 'dotenv/config';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { pool } from './db.ts';
import { NotFoundError } from './demoUser.ts';
import { insightsRouter } from './routes/insights.ts';
import { plansRouter } from './routes/plans.ts';
import { todayRouter } from './routes/today.ts';
import { userRouter } from './routes/user.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, db: 'connected' });
});

app.use('/api', userRouter);
app.use('/api', todayRouter);
app.use('/api', insightsRouter);
app.use('/api', plansRouter);

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
};
app.use(onError);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
