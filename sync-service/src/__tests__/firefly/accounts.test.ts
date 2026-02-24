/**
 * Tests for firefly/accounts.ts — upsertAccount + saveMapping.
 *
 * Mocks: firefly/client, db/client
 */

const mockGetAccounts = jest.fn();
const mockCreateAccount = jest.fn();
jest.mock('../../firefly/client', () => ({
  getAccounts: mockGetAccounts,
  createAccount: mockCreateAccount,
}));

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

import { upsertAccount } from '../../firefly/accounts';

afterEach(() => jest.clearAllMocks());

describe('upsertAccount', () => {
  test('returns cached ID on second call for same account', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no DB mapping
    mockGetAccounts.mockResolvedValueOnce([]); // no existing account
    mockCreateAccount.mockResolvedValueOnce({ id: 'ff-1' });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // save mapping

    const id1 = await upsertAccount('chase', 'ext-1', 'Checking', 'asset', 'USD', 1000);
    expect(id1).toBe('ff-1');

    // Second call should return from cache, no additional mock calls
    const id2 = await upsertAccount('chase', 'ext-1', 'Checking');
    expect(id2).toBe('ff-1');
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
  });

  test('uses DB mapping when available', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ firefly_account_map: { 'ext-2': 'ff-existing' } }],
    });
    const id = await upsertAccount('usaa', 'ext-2', 'Savings');
    expect(id).toBe('ff-existing');
    expect(mockGetAccounts).not.toHaveBeenCalled();
  });

  test('finds existing Firefly account by display name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no DB mapping
    mockGetAccounts.mockResolvedValueOnce([
      { id: 'ff-match', attributes: { name: '[CHASE] Checking' } },
    ]);
    mockQuery.mockResolvedValueOnce({ rows: [] }); // save mapping

    const id = await upsertAccount('chase', 'ext-3', 'Checking');
    expect(id).toBe('ff-match');
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  test('creates new account when no match found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no DB mapping
    mockGetAccounts.mockResolvedValueOnce([]); // no existing
    mockCreateAccount.mockResolvedValueOnce({ id: 'ff-new' });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // save mapping

    const id = await upsertAccount('usaa', 'ext-4', 'Savings', 'asset', 'USD', 5000);
    expect(id).toBe('ff-new');
    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '[USAA] Savings',
        type: 'asset',
        currency_code: 'USD',
        current_balance: 5000,
      })
    );
  });

  test('maps credit type to liabilities', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockGetAccounts.mockResolvedValueOnce([]);
    mockCreateAccount.mockResolvedValueOnce({ id: 'ff-cc' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertAccount('chase', 'ext-5', 'Credit Card', 'credit');
    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'liabilities' })
    );
  });

  test('handles DB mapping query failure gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    mockGetAccounts.mockResolvedValueOnce([]);
    mockCreateAccount.mockResolvedValueOnce({ id: 'ff-fallback' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const id = await upsertAccount('inst', 'ext-6', 'Acct');
    expect(id).toBe('ff-fallback');
  });
});
