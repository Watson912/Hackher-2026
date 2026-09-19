import 'dotenv/config';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { requireAuth } from './auth.ts';
import { pool } from './db.ts';
import { accountRouter } from './routes/account.ts';
import { insightsRouter } from './routes/insights.ts';
import { plansRouter } from './routes/plans.ts';
import { todayRouter } from './routes/today.ts';
import { userRouter } from './routes/user.ts';
import { wheelRouter } from './routes/wheel.ts';
import { NotFoundError, resolveUser } from './users.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, db: 'connected' });
});

// Everything below needs a valid Auth0 token for this API. /api/health above
// stays open so you can check the server without signing in.
app.use('/api', requireAuth);

// Creating users (onboarding, demo reset) needs a token but not an existing
// account, so it comes before user resolution.
app.use('/api', accountRouter);
app.use('/api', resolveUser);
app.use('/api', userRouter);
app.use('/api', todayRouter);
app.use('/api', wheelRouter);
app.use('/api', insightsRouter);
app.use('/api', plansRouter);

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  // A missing, expired, or wrong-audience token: express-oauth2-jwt-bearer
  // puts the right status on the error. Don't report it as a server fault.
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode;
  if (status === 401 || status === 403) {
    res.status(status).json({ error: err instanceof Error ? err.message : 'Not authorized' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
};
app.use(onError);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
