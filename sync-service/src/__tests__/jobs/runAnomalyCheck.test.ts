/**
 * Tests for runAnomalyCheck job.
 */

const mockGetTransactions = jest.fn();
jest.mock('../../firefly/client', () => ({
  getTransactions: mockGetTransactions,
}));

const mockCheckForAnomalies = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/anomaly', () => ({
  checkForAnomalies: mockCheckForAnomalies,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { runAnomalyCheck } from '../../jobs/runAnomalyCheck';

afterEach(() => jest.clearAllMocks());

describe('runAnomalyCheck', () => {
  test('maps Firefly transactions and calls checkForAnomalies', async () => {
    mockGetTransactions.mockResolvedValueOnce([
      { id: '1', attributes: { description: 'Coffee', amount: '4.50', date: '2025-01-15' } },
      { id: '2', attributes: { description: 'Gas', amount: '45.00', date: '2025-01-16' } },
    ]);

    await runAnomalyCheck();

    expect(mockGetTransactions).toHaveBeenCalledWith(1, 100);
    expect(mockCheckForAnomalies).toHaveBeenCalledWith([
      { id: '1', description: 'Coffee', amount: 4.5, date: '2025-01-15' },
      { id: '2', description: 'Gas', amount: 45, date: '2025-01-16' },
    ]);
  });

  test('skips anomaly check when no transactions', async () => {
    mockGetTransactions.mockResolvedValueOnce([]);

    await runAnomalyCheck();

    expect(mockCheckForAnomalies).not.toHaveBeenCalled();
  });

  test('handles missing attributes gracefully', async () => {
    mockGetTransactions.mockResolvedValueOnce([
      { id: '3', attributes: {} },
    ]);

    await runAnomalyCheck();

    expect(mockCheckForAnomalies).toHaveBeenCalledWith([
      { id: '3', description: '', amount: 0, date: '' },
    ]);
  });

  test('catches and logs API errors without throwing', async () => {
    mockGetTransactions.mockRejectedValueOnce(new Error('API down'));

    await expect(runAnomalyCheck()).resolves.toBeUndefined();
    expect(mockCheckForAnomalies).not.toHaveBeenCalled();
  });
});
