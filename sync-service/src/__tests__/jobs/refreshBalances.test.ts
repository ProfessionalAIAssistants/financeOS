/**
 * Tests for background jobs.
 */

// ── refreshBalances ──────────────────────────────────────────────────────────

const mockGetAccounts = jest.fn();
jest.mock('../../firefly/client', () => ({
  getAccounts: mockGetAccounts,
  getTransactions: jest.fn().mockResolvedValue([]),
  isHealthy: jest.fn().mockResolvedValue(true),
}));

const mockEvaluateRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({
  evaluateAlertRules: mockEvaluateRules,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { refreshBalances } from '../../jobs/refreshBalances';

afterEach(() => jest.clearAllMocks());

describe('refreshBalances', () => {
  test('triggers low_balance alert for accounts under $1000', async () => {
    mockGetAccounts.mockResolvedValueOnce([
      { attributes: { name: 'Checking', current_balance: '500', type: 'asset' } },
      { attributes: { name: 'Savings', current_balance: '5000', type: 'asset' } },
    ]);

    await refreshBalances();

    expect(mockEvaluateRules).toHaveBeenCalledTimes(1);
    expect(mockEvaluateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'low_balance',
        accountName: 'Checking',
        balance: 500,
      })
    );
  });

  test('does not alert for accounts at or above $1000', async () => {
    mockGetAccounts.mockResolvedValueOnce([
      { attributes: { name: 'Savings', current_balance: '1000', type: 'asset' } },
    ]);
    await refreshBalances();
    expect(mockEvaluateRules).not.toHaveBeenCalled();
  });

  test('does not alert for negative balances', async () => {
    mockGetAccounts.mockResolvedValueOnce([
      { attributes: { name: 'Credit', current_balance: '-500', type: 'asset' } },
    ]);
    await refreshBalances();
    expect(mockEvaluateRules).not.toHaveBeenCalled();
  });

  test('handles API error gracefully', async () => {
    mockGetAccounts.mockRejectedValueOnce(new Error('API fail'));
    await expect(refreshBalances()).resolves.toBeUndefined();
  });
});
