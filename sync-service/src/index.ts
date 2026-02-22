import express from 'express';
import cors from 'cors';
import { config } from './config';
import { testConnection } from './db/client';
import { isHealthy as fireflyHealthy } from './firefly/client';
import { startWatcher } from './financedl/watcher';
import { startScheduler } from './jobs/scheduler';

// Route imports
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

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// API routes
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

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Express] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function waitForDB(retries = 15, delayMs = 4000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      await testConnection();
      console.log('[DB] Connected');
      return;
    } catch (err) {
      console.log(`[DB] Attempt ${i}/${retries} failed — retrying in ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('Could not connect to database after multiple attempts');
}

async function main() {
  console.log(`[FinanceOS] Starting sync-service (${config.nodeEnv})...`);

  await waitForDB();

  // Start file watcher for finance-dl downloads
  try {
    startWatcher(config.downloadsDir);
  } catch (err) {
    console.warn('[Watcher] Failed to start:', err instanceof Error ? err.message : err);
  }

  // Start cron scheduler
  try {
    startScheduler();
  } catch (err) {
    console.warn('[Scheduler] Failed to start:', err instanceof Error ? err.message : err);
  }

  const server = app.listen(config.port, () => {
    console.log(`[FinanceOS] API listening on port ${config.port}`);
    console.log(`[FinanceOS] Firefly III: ${config.fireflyUrl}`);
    console.log(`[FinanceOS] Downloads dir: ${config.downloadsDir}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[FinanceOS] ${signal} received — shutting down gracefully...`);
    server.close(() => {
      console.log('[FinanceOS] HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[FinanceOS] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[FinanceOS] Fatal startup error:', err);
  process.exit(1);
});
