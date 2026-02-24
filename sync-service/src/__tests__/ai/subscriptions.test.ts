/**
 * Tests for subscription detection.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockEvaluateRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({
  evaluateAlertRules: mockEvaluateRules,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { detectSubscriptions } from '../../ai/subscriptions';

afterEach(() => jest.clearAllMocks());

describe('detectSubscriptions', () => {
  test('executes query without error', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await detectSubscriptions('user-1');

    expect(mockQuery).toHaveBeenCalled();
  });

  test('handles errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    await expect(detectSubscriptions()).resolves.toBeUndefined();
  });
});
