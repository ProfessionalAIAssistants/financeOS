/**
 * Tests for runDetectSubscriptions job.
 */

const mockDetectSubscriptions = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/subscriptions', () => ({
  detectSubscriptions: mockDetectSubscriptions,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { runDetectSubscriptions } from '../../jobs/detectSubscriptions';

afterEach(() => jest.clearAllMocks());

describe('runDetectSubscriptions', () => {
  test('calls detectSubscriptions', async () => {
    await runDetectSubscriptions();

    expect(mockDetectSubscriptions).toHaveBeenCalledTimes(1);
  });

  test('handles errors without throwing', async () => {
    mockDetectSubscriptions.mockRejectedValueOnce(new Error('Detection failed'));

    await expect(runDetectSubscriptions()).resolves.toBeUndefined();
  });
});
