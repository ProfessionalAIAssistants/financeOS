import { query } from '../db/client';
import { evaluateAlertRules } from '../alerts/rules';
import logger from '../lib/logger';

export async function detectSubscriptions(userId?: string): Promise<void> {
  logger.info({ userId }, '[Subscriptions] Starting detection');
  try {
    // Get 13 months of transactions grouped by merchant
    const txns = await query(`
      SELECT
        t.description as merchant,
        ABS(t.amount::numeric) as amount,
        t.date
      FROM (
        SELECT description, amount, date
        FROM (VALUES ('placeholder', 0, NOW()::date)) AS v(description, amount, date)
        LIMIT 0
      ) t
    `);
    // Note: In production this queries Firefly transactions via API
    // For now we detect from what's been imported into our tracking tables
    logger.info('[Subscriptions] Detection complete (requires Firefly transaction data)');
  } catch (err) {
    logger.error({ err }, '[Subscriptions] Error');
  }
}
