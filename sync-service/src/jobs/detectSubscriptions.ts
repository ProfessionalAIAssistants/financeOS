import { detectSubscriptions } from '../ai/subscriptions';
import logger from '../lib/logger';

export async function runDetectSubscriptions(): Promise<void> {
  logger.info('[Job] Running subscription detection...');
  try {
    await detectSubscriptions();
  } catch (err) {
    logger.error({ err }, '[Job] Subscription detection error');
  }
}
