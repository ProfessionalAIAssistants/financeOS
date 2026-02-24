import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { testConnection, closePool } from './db/client';
import { isHealthy as fireflyHealthy } from './firefly/client';
import { startWatcher } from './financedl/watcher';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { requireAuth } from './middleware/auth';
import logger from './lib/logger';

// Route imports
import authRouter from './api/routes/auth';
import billingRouter from './api/routes/billing';
import assetsRouter from './api/routes/assets';
import uploadRouter from './api/routes/upload';
import syncRouter from './api/routes/sync';
import networthRouter from './api/routes/networth';
import insightsRouter from './api/routes/insights';
import subscriptionsRouter from './api/routes/subscriptions';
import forecastingRouter from './api/routes/forecasting';
import alertsRouter from './api/routes/alerts';
import insuranceRouter from './api/routes/insurance';
import budgetsRouter from './api/routes/budgets';
import tagsRouter from './api/routes/tags';
import transactionsRouter from './api/routes/transactions';
import plaidRouter from './api/routes/plaid';

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cookieParser());

// Global rate limit: 200 requests per 15 min per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// Strict rate limit for auth endpoints: 20 requests per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' },
});

// CORS: restrict to app URL in production, allow frontend origin in development
const corsOrigin = config.isProd ? config.appUrl : [config.appUrl, 'http://localhost:57072', 'http://localhost:5173'];
app.use(cors({ origin: corsOrigin, credentials: true }));

// Stripe webhooks need the raw body — must come before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health endpoint
app.get('/health', async (_req, res) => {
  try {
    await testConnection();
    const ffOk = await fireflyHealthy();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: true,
        firefly: ffOk,
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Public routes (no auth required)
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/billing', billingRouter); // /plans + /webhook are public; /checkout + /portal use requireAuth internally
app.post('/api/plaid/webhook', express.json(), plaidRouter); // Plaid webhooks are unauthenticated

// All routes below this line require a valid JWT
app.use(requireAuth);

// API routes
app.use('/api/plaid', plaidRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/sync', syncRouter);
app.use('/api/networth', networthRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/forecasting', forecastingRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/transactions', transactionsRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler — never leak stack traces or internal details in production
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: err.message }, 'Unhandled Express error');
  res.status(500).json({ error: 'Internal server error' });
});

// ── Process-level error handlers ──────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason instanceof Error ? reason.message : String(reason) }, 'Unhandled Promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message }, 'Uncaught exception — shutting down');
  process.exit(1);
});

async function waitForDB(retries = 15, delayMs = 4000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      await testConnection();
      logger.info('Database connected');
      return;
    } catch {
      logger.warn({ attempt: i, maxRetries: retries }, 'DB connection failed — retrying');
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Could not connect to database after multiple attempts');
}

async function main() {
  logger.info({ env: config.nodeEnv }, 'Starting sync-service');

  await waitForDB();

  // Start file watcher for finance-dl downloads
  try {
    startWatcher(config.downloadsDir);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'Watcher failed to start');
  }

  // Start cron scheduler
  try {
    startScheduler();
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, 'Scheduler failed to start');
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, firefly: config.fireflyUrl }, 'API listening');
  });

  // Graceful shutdown — close HTTP, DB pool, and scheduler
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    stopScheduler();
    server.close(async () => {
      logger.info('HTTP server closed');
      await closePool();
      logger.info('DB pool closed');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  logger.fatal({ err: err instanceof Error ? err.message : err }, 'Fatal startup error');
  process.exit(1);
});
