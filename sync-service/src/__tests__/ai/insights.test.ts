/**
 * Tests for AI insights generation.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockCreateAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/ntfy', () => ({
  createAlert: mockCreateAlert,
}));

jest.mock('../../config', () => ({
  config: { openaiApiKey: '' }, // No OpenAI key - use fallback narrative
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { generateMonthlyInsights } from '../../ai/insights';

afterEach(() => jest.clearAllMocks());

describe('generateMonthlyInsights', () => {
  test('generates fallback narrative when no OpenAI key', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        net_worth: '150000',
        total_assets: '200000',
        total_liabilities: '50000',
        breakdown: { monthlyIncome: 8000, monthlyExpenses: 5000 },
      }],
    });

    await generateMonthlyInsights(2025, 1, 'user-1');

    expect(mockCreateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Monthly Insights'),
        message: expect.stringContaining('$150,000'),
        priority: 'low',
        ruleType: 'monthly_insights',
      }),
      true
    );
    // Should include savings rate info
    expect(mockCreateAlert.mock.calls[0][0].message).toContain('38%');
  });

  test('handles missing net worth snapshot', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await generateMonthlyInsights(2025, 6);

    expect(mockCreateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('$0'),
      }),
      true
    );
  });

  test('handles zero income gracefully (savings rate 0)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        net_worth: '10000',
        total_assets: '10000',
        total_liabilities: '0',
        breakdown: {},
      }],
    });

    await generateMonthlyInsights(2025, 3);

    // Should not divide by zero
    expect(mockCreateAlert).toHaveBeenCalled();
    const msg = mockCreateAlert.mock.calls[0][0].message;
    expect(msg).not.toContain('NaN');
  });

  test('passes user-scoped query when userId provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await generateMonthlyInsights(2025, 1, 'user-42');

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_id'),
      expect.arrayContaining(['user-42'])
    );
  });

  test('uses unscoped query when no userId', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await generateMonthlyInsights(2025, 1);

    const call = mockQuery.mock.calls[0];
    expect(call[0]).not.toContain('user_id = $1');
  });
});
