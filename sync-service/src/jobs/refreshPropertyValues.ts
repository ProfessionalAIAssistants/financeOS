import { query } from '../db/client';
import { fetchPropertyValue } from '../assets/propertyValuation';
import { evaluateAlertRules } from '../alerts/rules';

export async function refreshPropertyValues(): Promise<void> {
  console.log('[PropertyValues] Refreshing...');
  try {
    const assets = await query(
      `SELECT * FROM manual_assets WHERE asset_type = 'real_estate' AND is_active = true`
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
          description: `${asset.name} value ${changePct > 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(1)}%: $${newValue.toLocaleString()}`,
          amount: newValue,
          metadata: { assetId: asset.id, oldValue, newValue, changePct },
        });
      }
    }
  } catch (err) {
    console.error('[PropertyValues] Error:', err instanceof Error ? err.message : err);
  }
}
