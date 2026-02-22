import { detectSubscriptions } from '../ai/subscriptions';

export async function runDetectSubscriptions(): Promise<void> {
  console.log('[Job] Running subscription detection...');
  try {
    await detectSubscriptions();
  } catch (err) {
    console.error('[Job] Subscription detection error:', err instanceof Error ? err.message : err);
  }
}
