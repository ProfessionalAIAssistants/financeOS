import { getTransactions } from '../firefly/client';
import { checkForAnomalies } from '../ai/anomaly';
import logger from '../lib/logger';

export async function runAnomalyCheck(): Promise<void> {
  logger.info('Running anomaly check');
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
    logger.error({ err: err instanceof Error ? err.message : err }, 'Anomaly check error');
  }
}
