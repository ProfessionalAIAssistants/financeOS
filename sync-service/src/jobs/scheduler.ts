import cron from 'node-cron';
import { syncOFX }                from './syncOFX';
import { snapshotNetWorth }        from './snapshotNetWorth';
import { refreshBalances }         from './refreshBalances';
import { runFinanceDL }            from './runFinanceDL';
import { refreshPropertyValues }   from './refreshPropertyValues';
import { runDetectSubscriptions }  from './detectSubscriptions';
import { runAnomalyCheck }         from './runAnomalyCheck';
import { runForecastingJob }       from './runForecasting';
import { generateMonthlyInsights } from '../ai/insights';

export function startScheduler(): void {
  // Balance refresh — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await refreshBalances();
  });

  // OFX sync — 6am, 12pm, 6pm
  cron.schedule('0 6,12,18 * * *', async () => {
    await syncOFX();
    await snapshotNetWorth();
  });

  // finance-dl scraper — 7am daily
  cron.schedule('0 7 * * *', async () => {
    await runFinanceDL(['capitalone', 'macu', 'm1finance']);
    await snapshotNetWorth();
  });

  // Net worth snapshot — midnight daily
  cron.schedule('0 0 * * *', async () => {
    await snapshotNetWorth();
  });

  // Monthly AI insights — 1st of month at 1am
  cron.schedule('0 1 1 * *', async () => {
    const now = new Date();
    await generateMonthlyInsights(now.getFullYear(), now.getMonth() + 1);
  });

  // Forecasting — Sunday 3am
  cron.schedule('0 3 * * 0', async () => {
    await runForecastingJob();
  });

  // Property values — Sunday 4am
  cron.schedule('0 4 * * 0', async () => {
    await refreshPropertyValues();
  });

  // Subscription detection — Monday 8am
  cron.schedule('0 8 * * 1', async () => {
    await runDetectSubscriptions();
  });

  // Anomaly check — 9am daily
  cron.schedule('0 9 * * *', async () => {
    await runAnomalyCheck();
  });

  console.log('[Scheduler] All jobs registered');
}
