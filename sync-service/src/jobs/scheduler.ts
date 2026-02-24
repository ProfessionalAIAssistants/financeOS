import cron, { ScheduledTask } from 'node-cron';
import { syncOFX }                from './syncOFX';
import { snapshotNetWorth }        from './snapshotNetWorth';
import { refreshBalances }         from './refreshBalances';
import { runFinanceDL }            from './runFinanceDL';
import { refreshPropertyValues }   from './refreshPropertyValues';
import { runDetectSubscriptions }  from './detectSubscriptions';
import { runAnomalyCheck }         from './runAnomalyCheck';
import { runForecastingJob }       from './runForecasting';
import { generateMonthlyInsights } from '../ai/insights';
import { query }                   from '../db/client';
import { syncPlaidTransactions, refreshPlaidBalances } from '../plaid/sync';
import logger from '../lib/logger';

const scheduledTasks: ScheduledTask[] = [];

/** Get all user IDs for multi-tenant job iteration */
async function getAllUserIds(): Promise<string[]> {
  try {
    const res = await query('SELECT id FROM app_users');
    return res.rows.map(r => r.id);
  } catch {
    // If app_users table doesn't exist yet (pre-SaaS), return empty
    return [];
  }
}

/** Run a per-user job for every registered user */
async function forEachUser(jobName: string, fn: (userId: string) => Promise<void>): Promise<void> {
  const userIds = await getAllUserIds();
  if (userIds.length === 0) {
    // Fallback: run without userId (legacy single-user mode)
    logger.info({ job: jobName }, 'No users found — running in legacy mode');
    return;
  }
  for (const userId of userIds) {
    try {
      await fn(userId);
    } catch (err) {
      logger.error({ job: jobName, userId, err: err instanceof Error ? err.message : err }, 'Per-user job failed');
    }
  }
}

export function startScheduler(): void {
  // Balance refresh — every 15 minutes
  scheduledTasks.push(cron.schedule('*/15 * * * *', async () => {
    try {
      await refreshBalances();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'refreshBalances error');
    }
  }));

  // OFX sync — 6am, 12pm, 6pm
  scheduledTasks.push(cron.schedule('0 6,12,18 * * *', async () => {
    try {
      await syncOFX();
      await forEachUser('snapshotNetWorth', snapshotNetWorth);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'OFX sync error');
    }
  }));

  // finance-dl scraper — 7am daily
  scheduledTasks.push(cron.schedule('0 7 * * *', async () => {
    try {
      await runFinanceDL(['capitalone', 'macu', 'm1finance']);
      await forEachUser('snapshotNetWorth', snapshotNetWorth);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'finance-dl error');
    }
  }));

  // Net worth snapshot — midnight daily
  scheduledTasks.push(cron.schedule('0 0 * * *', async () => {
    try {
      await forEachUser('snapshotNetWorth', snapshotNetWorth);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'snapshot error');
    }
  }));

  // Monthly AI insights — 1st of month at 1am
  scheduledTasks.push(cron.schedule('0 1 1 * *', async () => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      await forEachUser('generateMonthlyInsights', (userId) => generateMonthlyInsights(year, month, userId));
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'insights error');
    }
  }));

  // Forecasting — Sunday 3am
  scheduledTasks.push(cron.schedule('0 3 * * 0', async () => {
    try {
      await runForecastingJob();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'forecasting error');
    }
  }));

  // Property values — Sunday 4am
  scheduledTasks.push(cron.schedule('0 4 * * 0', async () => {
    try {
      await refreshPropertyValues();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'property values error');
    }
  }));

  // Subscription detection — Monday 8am
  scheduledTasks.push(cron.schedule('0 8 * * 1', async () => {
    try {
      await runDetectSubscriptions();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'subscription detection error');
    }
  }));

  // Anomaly check — 9am daily
  scheduledTasks.push(cron.schedule('0 9 * * *', async () => {
    try {
      await runAnomalyCheck();
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'anomaly check error');
    }
  }));

  // Plaid transaction sync — every 4 hours
  scheduledTasks.push(cron.schedule('0 */4 * * *', async () => {
    try {
      const items = await query(
        "SELECT item_id FROM plaid_items WHERE status != 'login_required'"
      );
      for (const item of items.rows) {
        try {
          await syncPlaidTransactions(item.item_id);
          await refreshPlaidBalances(item.item_id);
        } catch (err) {
          logger.error({ itemId: item.item_id, err: err instanceof Error ? err.message : err }, 'Plaid sync failed for item');
        }
      }
      logger.info({ count: items.rows.length }, 'Plaid sync complete');
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid sync error');
    }
  }));

  // Plaid balance refresh — every 30 minutes
  scheduledTasks.push(cron.schedule('*/30 * * * *', async () => {
    try {
      const items = await query(
        "SELECT item_id FROM plaid_items WHERE status = 'good'"
      );
      for (const item of items.rows) {
        try {
          await refreshPlaidBalances(item.item_id);
        } catch (err) {
          logger.error({ itemId: item.item_id, err: err instanceof Error ? err.message : err }, 'Plaid balance refresh failed for item');
        }
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid balance refresh error');
    }
  }));

  logger.info('All scheduler jobs registered');
}

/** Stop all scheduled cron tasks — called during graceful shutdown */
export function stopScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  logger.info('All scheduler jobs stopped');
}
