import { getAccounts } from '../firefly/client';
import { query } from '../db/client';
import { evaluateAlertRules } from '../alerts/rules';
import { calculateAmortization } from '../assets/amortization';
import logger from '../lib/logger';

export async function snapshotNetWorth(userId?: string): Promise<void> {
  logger.info({ userId }, 'Taking net worth snapshot');
  try {
    const accounts = await getAccounts();
    let totalAssets = 0;
    let totalLiabilities = 0;
    const breakdown: Record<string, number> = {};

    for (const acct of accounts) {
      const balance = parseFloat(acct.attributes?.current_balance ?? '0');
      const type    = acct.attributes?.type ?? 'asset';
      const name    = acct.attributes?.name ?? '';

      if (type === 'liabilities' || type === 'expense') {
        totalLiabilities += Math.abs(balance);
      } else {
        totalAssets += balance;
      }
      breakdown[name] = balance;
    }

    // Add manual assets
    const assets = userId
      ? await query(
          `SELECT id, name, asset_type, current_value, note_principal, note_rate, note_term_months, note_start_date
           FROM manual_assets WHERE is_active = true AND user_id = $1`,
          [userId]
        )
      : await query(
          `SELECT id, name, asset_type, current_value, note_principal, note_rate, note_term_months, note_start_date
           FROM manual_assets WHERE is_active = true`
        );

    for (const asset of assets.rows) {
      let value = parseFloat(asset.current_value ?? '0');

      // Auto-calculate current balance for promissory notes
      if ((asset.asset_type === 'note_receivable' || asset.asset_type === 'note_payable') && asset.note_principal && asset.note_rate && asset.note_term_months && asset.note_start_date) {
        const amort = calculateAmortization(
          parseFloat(asset.note_principal),
          parseFloat(asset.note_rate),
          asset.note_term_months,
          asset.note_start_date
        );
        value = amort.currentBalance;
        // Update DB with calculated balance
        await query(
          'UPDATE manual_assets SET current_value = $1 WHERE id = $2',
          [value, asset.id]
        );
      }

      totalAssets += value;
      breakdown[`manual:${asset.name}`] = value;
    }

    const netWorth = totalAssets - totalLiabilities;

    if (userId) {
      await query(
        `INSERT INTO net_worth_snapshots (user_id, snapshot_date, net_worth, total_assets, total_liabilities, breakdown)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
         ON CONFLICT (user_id, snapshot_date) DO UPDATE SET net_worth = $2, total_assets = $3, total_liabilities = $4, breakdown = $5`,
        [userId, netWorth, totalAssets, totalLiabilities, JSON.stringify(breakdown)]
      );
    } else {
      // Legacy single-user fallback (scheduler without user context)
      await query(
        `INSERT INTO net_worth_snapshots (snapshot_date, net_worth, total_assets, total_liabilities, breakdown)
         VALUES (CURRENT_DATE, $1, $2, $3, $4)
         ON CONFLICT (snapshot_date) DO UPDATE SET net_worth = $1, total_assets = $2, total_liabilities = $3, breakdown = $4`,
        [netWorth, totalAssets, totalLiabilities, JSON.stringify(breakdown)]
      );
    }

    // Check milestones ($50k increments)
    const prevQuery = userId
      ? `SELECT net_worth FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC OFFSET 1 LIMIT 1`
      : `SELECT net_worth FROM net_worth_snapshots ORDER BY snapshot_date DESC OFFSET 1 LIMIT 1`;
    const prevRes = await query(prevQuery, userId ? [userId] : []);
    const prev = parseFloat(prevRes.rows[0]?.net_worth ?? '0');
    const milestone = Math.floor(netWorth / 50000) * 50000;
    if (prev < milestone && netWorth >= milestone) {
      await evaluateAlertRules({
        type: 'net_worth_milestone',
        userId,
        description: `Net worth crossed $${milestone.toLocaleString()}! Current: $${netWorth.toLocaleString()}`,
        metadata: { milestone, netWorth },
      });
    }

    logger.info({ netWorth }, 'Net worth snapshot complete');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Snapshot error');
  }
}
