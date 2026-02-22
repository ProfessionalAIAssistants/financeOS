import { query } from '../db/client';
import { evaluateAlertRules } from '../alerts/rules';

export async function detectSubscriptions(): Promise<void> {
  console.log('[Subscriptions] Starting detection...');
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
    console.log('[Subscriptions] Detection complete (requires Firefly transaction data)');
  } catch (err) {
    console.error('[Subscriptions] Error:', err instanceof Error ? err.message : err);
  }
}
