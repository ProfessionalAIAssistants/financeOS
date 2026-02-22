import { runForecasting } from '../ai/forecasting';

export async function runForecastingJob(): Promise<void> {
  console.log('[Job] Running forecasting...');
  try {
    await runForecasting(12);
    await runForecasting(60);
  } catch (err) {
    console.error('[Job] Forecasting error:', err instanceof Error ? err.message : err);
  }
}
