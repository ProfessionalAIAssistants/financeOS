import { query } from '../db/client';
import { fetchPropertyValue } from '../assets/propertyValuation';
import { evaluateAlertRules } from '../alerts/rules';
import logger from '../lib/logger';

export async function refreshPropertyValues(): Promise<void> {
  logger.info('Refreshing property values');
  try {
    const assets = await query(
      `SELECT id, user_id, name, address, city, state, zip, current_value
       FROM manual_assets WHERE asset_type = 'real_estate' AND is_active = true`
    );

    for (const asset of assets.rows) {
      if (!asset.address || !asset.city || !asset.state) continue;

      const valuation = await fetchPropertyValue(asset.address, asset.city, asset.state, asset.zip ?? '');
      if (!valuation) continue;

      const oldValue  = parseFloat(asset.current_value ?? '0');
      const newValue  = valuation.value;
      const changePct = oldValue > 0 ? ((newValue - oldValue) / oldValue) * 100 : 0;

      await query(
        'UPDATE manual_assets SET current_value = $1, updated_at = now() WHERE id = $2',
        [newValue, asset.id]
      );

      await query(
        `INSERT INTO asset_value_history (asset_id, value, source)
         VALUES ($1, $2, $3)`,
        [asset.id, newValue, valuation.source]
      );

      if (Math.abs(changePct) > 5) {
        await evaluateAlertRules({
          type: 'asset_value_change',
          userId: asset.user_id,
          description: `${asset.name} value ${changePct > 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(1)}%: $${newValue.toLocaleString()}`,
          amount: newValue,
          metadata: { assetId: asset.id, oldValue, newValue, changePct },
        });
      }
    }
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Property values refresh error');
  }
}
