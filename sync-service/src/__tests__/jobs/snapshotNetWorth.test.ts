/**
 * Tests for snapshotNetWorth job.
 */

const mockGetAccounts = jest.fn();
jest.mock('../../firefly/client', () => ({
  getAccounts: mockGetAccounts,
}));

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockEvaluateRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({
  evaluateAlertRules: mockEvaluateRules,
}));

jest.mock('../../assets/amortization', () => ({
  calculateAmortization: jest.fn().mockReturnValue({
    currentBalance: 45000,
    monthlyPayment: 500,
  }),
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { snapshotNetWorth } from '../../jobs/snapshotNetWorth';

afterEach(() => jest.clearAllMocks());

describe('snapshotNetWorth', () => {
  test('calculates net worth from Firefly accounts', async () => {
    mockGetAccounts.mockResolvedValueOnce([
      { attributes: { name: 'Checking', current_balance: '10000', type: 'asset' } },
      { attributes: { name: 'Credit Card', current_balance: '-2000', type: 'liabilities' } },
    ]);
    // manual assets query
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT snapshot (with userId)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // milestone check
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await snapshotNetWorth('user-1');

    // Should insert with net_worth = 10000 - 2000 = 8000
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO net_worth_snapshots'),
      expect.arrayContaining(['user-1', 8000, 10000, 2000])
    );
  });

  test('adds manual assets to total', async () => {
    mockGetAccounts.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'a1', name: 'House', asset_type: 'real_estate', current_value: '300000' }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // insert snapshot
    mockQuery.mockResolvedValueOnce({ rows: [] }); // milestone check

    await snapshotNetWorth('user-1');

    expect(mockQuery.mock.calls[1][1]).toEqual(
      expect.arrayContaining([300000]) // total_assets should include 300k
    );
  });

  test('auto-calculates note balances using amortization', async () => {
    mockGetAccounts.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a2', name: 'Note', asset_type: 'note_receivable', current_value: '50000',
        note_principal: '50000', note_rate: '5', note_term_months: '120', note_start_date: '2025-01-01',
      }],
    });
    // Update manual_assets with calculated balance
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Insert snapshot
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Milestone check
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await snapshotNetWorth('user-1');

    // Should have updated the manual_assets table with calculated balance
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE manual_assets SET current_value = $1 WHERE id = $2',
      [45000, 'a2']
    );
  });

  test('triggers milestone alert when crossing $50k boundary', async () => {
    mockGetAccounts.mockResolvedValueOnce([
      { attributes: { name: 'Savings', current_balance: '51000', type: 'asset' } },
    ]);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // manual assets
    mockQuery.mockResolvedValueOnce({ rows: [] }); // insert snapshot
    // Previous net worth was $49k
    mockQuery.mockResolvedValueOnce({ rows: [{ net_worth: '49000' }] });

    await snapshotNetWorth('user-1');

    expect(mockEvaluateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'net_worth_milestone',
        metadata: expect.objectContaining({ milestone: 50000 }),
      })
    );
  });

  test('does not trigger milestone when not crossing boundary', async () => {
    mockGetAccounts.mockResolvedValueOnce([
      { attributes: { name: 'Savings', current_balance: '52000', type: 'asset' } },
    ]);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ net_worth: '51000' }] });

    await snapshotNetWorth('user-1');

    expect(mockEvaluateRules).not.toHaveBeenCalled();
  });

  test('handles errors gracefully without throwing', async () => {
    mockGetAccounts.mockRejectedValueOnce(new Error('Firefly down'));
    await expect(snapshotNetWorth('user-1')).resolves.toBeUndefined();
  });

  test('works without userId (legacy single-user mode)', async () => {
    mockGetAccounts.mockResolvedValueOnce([]);
    // Manual assets without userId
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Insert snapshot (no user_id)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Milestone check
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await snapshotNetWorth();

    expect(mockQuery.mock.calls[1][0]).not.toContain('user_id');
  });
});
