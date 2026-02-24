/**
 * Tests for runForecastingJob.
 */

const mockRunForecasting = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/forecasting', () => ({
  runForecasting: mockRunForecasting,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { runForecastingJob } from '../../jobs/runForecasting';

afterEach(() => jest.clearAllMocks());

describe('runForecastingJob', () => {
  test('calls runForecasting with 12 and 60 month horizons', async () => {
    await runForecastingJob();

    expect(mockRunForecasting).toHaveBeenCalledTimes(2);
    expect(mockRunForecasting).toHaveBeenNthCalledWith(1, 12);
    expect(mockRunForecasting).toHaveBeenNthCalledWith(2, 60);
  });

  test('handles errors without throwing', async () => {
    mockRunForecasting.mockRejectedValueOnce(new Error('Forecast failed'));

    await expect(runForecastingJob()).resolves.toBeUndefined();
  });
});
