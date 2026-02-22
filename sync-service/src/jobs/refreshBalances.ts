import { getAccounts } from '../firefly/client';
import { evaluateAlertRules } from '../alerts/rules';

export async function refreshBalances(): Promise<void> {
  try {
    const accounts = await getAccounts('asset');
    for (const acct of accounts) {
      const balance = parseFloat(acct.attributes?.current_balance ?? '0');
      const name    = acct.attributes?.name ?? '';
      if (balance < 1000 && balance >= 0) {
        await evaluateAlertRules({
          type: 'low_balance',
          accountName: name,
          balance,
        });
      }
    }
  } catch (err) {
    console.error('[RefreshBalances] Error:', err instanceof Error ? err.message : err);
  }
}
