import { runForecasting } from '../ai/forecasting';
import logger from '../lib/logger';

export async function runForecastingJob(): Promise<void> {
  logger.info('Running forecasting job');
  try {
    await runForecasting(12);
    await runForecasting(60);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Forecasting job error');
  }
}
