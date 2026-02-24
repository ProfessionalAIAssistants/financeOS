/**
 * Tests for firefly/transactions.ts — upsertTransactions, helpers.
 */

const mockCreateTransaction = jest.fn();
const mockGetTransactions = jest.fn();
jest.mock('../../firefly/client', () => ({
  createTransaction: mockCreateTransaction,
  getTransactions: mockGetTransactions,
}));

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { upsertTransactions } from '../../firefly/transactions';

afterEach(() => jest.clearAllMocks());

describe('upsertTransactions', () => {
  test('adds new transactions and returns count', async () => {
    // isImported → not found
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // createTransaction
    mockCreateTransaction.mockResolvedValueOnce({ id: 'ff-tx-1' });
    // markImported
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await upsertTransactions('chase', 'ff-acct-1', [
      { date: '2026-01-15', name: 'AMAZON', amount: -49.99 },
    ]);
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
  });

  test('skips already-imported transactions', async () => {
    // isImported → found
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

    const result = await upsertTransactions('chase', 'ff-acct-1', [
      { id: 'tx-1', date: '2026-01-15', name: 'AMAZON', amount: -49.99 },
    ]);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('handles negative amounts as withdrawals', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'ff-tx-2' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertTransactions('chase', 'ff-acct-1', [
      { date: '2026-01-15', name: 'Purchase', amount: -25.00 },
    ]);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'withdrawal',
        amount: '25.00',
        source_id: 'ff-acct-1',
      })
    );
  });

  test('handles positive amounts as deposits', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'ff-tx-3' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertTransactions('chase', 'ff-acct-1', [
      { date: '2026-01-15', name: 'Paycheck', amount: 3000 },
    ]);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'deposit',
        amount: '3000.00',
        destination_id: 'ff-acct-1',
      })
    );
  });

  test('processes multiple transactions', async () => {
    // Tx1: not imported → create → mark
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'ft1' });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Tx2: already imported
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'ex' }] });
    // Tx3: not imported → create → mark
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'ft2' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await upsertTransactions('chase', 'acct', [
      { date: '2026-01-01', name: 'A', amount: -10 },
      { id: 'dup-1', date: '2026-01-02', name: 'B', amount: -20 },
      { date: '2026-01-03', name: 'C', amount: 50 },
    ]);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
  });

  test('handles duplicate error from Firefly as skip', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockRejectedValueOnce(new Error('duplicate'));

    const result = await upsertTransactions('chase', 'acct', [
      { date: '2026-01-01', name: 'Dup', amount: -10 },
    ]);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test('parses various date formats', async () => {
    // YYYYMMDD format
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'f1' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertTransactions('chase', 'acct', [
      { date: '20260115', name: 'Test', amount: -10 },
    ]);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-15' })
    );
  });

  test('parses MM/DD/YYYY date format', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'f2' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertTransactions('inst', 'acct', [
      { date: '01/15/2026', name: 'Test', amount: -10 },
    ]);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-01-15' })
    );
  });

  test('handles string amounts with $ signs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'f3' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertTransactions('inst', 'acct', [
      { date: '2026-01-15', name: 'Test', amount: '$1,234.56' as unknown as number },
    ]);
    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '1234.56' })
    );
  });

  test('generates external ID when none provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockCreateTransaction.mockResolvedValueOnce({ id: 'f4' });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await upsertTransactions('inst', 'acct', [
      { date: '2026-01-15', name: 'Test', amount: -10 },
    ]);
    const call = mockCreateTransaction.mock.calls[0][0];
    expect(call.external_id).toContain('inst-');
    expect(call.external_id).toContain('2026-01-15');
  });

  test('handles empty transactions array', async () => {
    const result = await upsertTransactions('inst', 'acct', []);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
