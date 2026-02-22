import { getAccounts } from '../firefly/client';
import { query } from '../db/client';
import { evaluateAlertRules } from '../alerts/rules';
import { calculateAmortization } from '../assets/amortization';

export async function snapshotNetWorth(): Promise<void> {
  console.log('[Snapshot] Taking net worth snapshot...');
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
    const assets = await query(
      `SELECT * FROM manual_assets WHERE is_active = true`
    );

    for (const asset of assets.rows) {
      let value = parseFloat(asset.current_value ?? '0');

      // Auto-calculate current balance for promissory notes
      if (asset.asset_type === 'note' && asset.principal && asset.interest_rate && asset.term_months && asset.start_date) {
        const amort = calculateAmortization(
          parseFloat(asset.principal),
          parseFloat(asset.interest_rate),
          asset.term_months,
          asset.start_date
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

    await query(
      `INSERT INTO net_worth_snapshots (net_worth, total_assets, total_liabilities, breakdown)
       VALUES ($1, $2, $3, $4)`,
      [netWorth, totalAssets, totalLiabilities, JSON.stringify(breakdown)]
    );

    // Check milestones ($50k increments)
    const prevRes = await query(
      `SELECT net_worth FROM net_worth_snapshots
       ORDER BY snapshot_date DESC OFFSET 1 LIMIT 1`
    );
    const prev = parseFloat(prevRes.rows[0]?.net_worth ?? '0');
    const milestone = Math.floor(netWorth / 50000) * 50000;
    if (prev < milestone && netWorth >= milestone) {
      await evaluateAlertRules({
        type: 'net_worth_milestone',
        description: `Net worth crossed $${milestone.toLocaleString()}! Current: $${netWorth.toLocaleString()}`,
        metadata: { milestone, netWorth },
      });
    }

    console.log(`[Snapshot] Net worth: $${netWorth.toLocaleString()}`);
  } catch (err) {
    console.error('[Snapshot] Error:', err instanceof Error ? err.message : err);
  }
}
