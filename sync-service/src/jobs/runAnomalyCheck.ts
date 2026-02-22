import { getTransactions } from '../firefly/client';
import { checkForAnomalies } from '../ai/anomaly';

export async function runAnomalyCheck(): Promise<void> {
  console.log('[Job] Running anomaly check...');
  try {
    const txns = await getTransactions(1, 100);
    if (!txns.length) return;
    await checkForAnomalies(txns.map((t: { id: string; attributes: { description: string; amount: string; date: string } }) => ({
      id: String(t.id),
      description: t.attributes?.description ?? '',
      amount: parseFloat(t.attributes?.amount ?? '0'),
      date: t.attributes?.date ?? '',
    })));
  } catch (err) {
    console.error('[Job] Anomaly check error:', err instanceof Error ? err.message : err);
  }
}
