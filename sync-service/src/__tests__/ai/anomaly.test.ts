/**
 * Tests for checkForAnomalies.
 *
 * Mocks:
 *  - db/client  – controls what "historical average" data the DB returns
 *  - alerts/rules – spy to verify evaluateAlertRules is/isn't called
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockEvaluateAlertRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({ evaluateAlertRules: mockEvaluateAlertRules }));

import { checkForAnomalies } from '../../ai/anomaly';

// Helpers
function histRow(avg: number, cnt: number) {
  return { rows: [{ avg_amt: String(avg), cnt: String(cnt) }] };
}
function insertOk() {
  return { rows: [] };
}

const baseTx = (overrides?: Partial<{
  id: string; description: string; amount: number; date: string;
  merchantName: string; category: string;
}>) => ({
  id: '1',
  description: 'TEST MERCHANT',
  amount: 50,
  date: '2026-01-01',
  ...overrides,
});

afterEach(() => {
  mockQuery.mockReset();
  mockEvaluateAlertRules.mockClear();
});

// ── Skip credits ──────────────────────────────────────────────────────────────

describe('checkForAnomalies – skips credits (amount ≤ 0)', () => {
  test('does not call DB or alert for income transaction', async () => {
    await checkForAnomalies([baseTx({ amount: -500 })]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });

  test('does not call DB or alert for zero-amount transaction', async () => {
    await checkForAnomalies([baseTx({ amount: 0 })]);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });

  test('handles empty array without throwing', async () => {
    await expect(checkForAnomalies([])).resolves.toBeUndefined();
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });
});

// ── New merchant > $100 → alert ───────────────────────────────────────────────

describe('checkForAnomalies – new merchant over $100', () => {
  beforeEach(() => {
    // Historical lookup returns 0 records (new merchant)
    mockQuery
      .mockResolvedValueOnce(histRow(0, 0)) // SELECT AVG / COUNT
      .mockResolvedValueOnce(insertOk());    // INSERT into history
  });

  test('fires anomaly alert when new merchant charges > $100', async () => {
    await checkForAnomalies([baseTx({ amount: 150 })]);
    expect(mockEvaluateAlertRules).toHaveBeenCalledTimes(1);
    const call = mockEvaluateAlertRules.mock.calls[0][0];
    expect(call.type).toBe('anomaly');
    expect(call.metadata?.isNew).toBe(true);
  });

  test('alert description contains merchant name', async () => {
    await checkForAnomalies([baseTx({ amount: 200, description: 'MYSTERY SHOP' })]);
    const call = mockEvaluateAlertRules.mock.calls[0][0];
    expect(call.description).toContain('MYSTERY SHOP');
  });

  test('no alert when new merchant charges ≤ $100', async () => {
    // beforeEach already queued histRow(0, 0) + insertOk()
    await checkForAnomalies([baseTx({ amount: 99.99 })]);
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });

  test('no alert when new merchant charges exactly $100', async () => {
    // beforeEach already queued histRow(0, 0) + insertOk()
    await checkForAnomalies([baseTx({ amount: 100 })]);
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });

  test('uses merchantName field when present', async () => {
    await checkForAnomalies([baseTx({ amount: 150, merchantName: 'FANCY STORE' })]);
    const call = mockEvaluateAlertRules.mock.calls[0][0];
    expect(call.description).toContain('FANCY STORE');
  });
});

// ── 2.5× above average → alert ────────────────────────────────────────────────

describe('checkForAnomalies – unusually large vs historical average', () => {
  test('fires anomaly alert when amount is 2.5× average', async () => {
    // avg = 40, count = 10 → threshold = 100; amount = 120 → triggers
    mockQuery
      .mockResolvedValueOnce(histRow(40, 10))
      .mockResolvedValueOnce(insertOk());

    await checkForAnomalies([baseTx({ amount: 120 })]);
    expect(mockEvaluateAlertRules).toHaveBeenCalledTimes(1);
    const call = mockEvaluateAlertRules.mock.calls[0][0];
    expect(call.type).toBe('anomaly');
    expect(call.metadata?.multiple).toBeCloseTo(3, 0);
  });

  test('fires alert exactly at 2.5× threshold', async () => {
    mockQuery
      .mockResolvedValueOnce(histRow(40, 5))
      .mockResolvedValueOnce(insertOk());

    // 40 * 2.5 = 100; amount = 100.01 → should trigger
    await checkForAnomalies([baseTx({ amount: 100.01 })]);
    expect(mockEvaluateAlertRules).toHaveBeenCalledTimes(1);
  });

  test('no alert when amount is just below 2.5× average', async () => {
    mockQuery
      .mockResolvedValueOnce(histRow(40, 5))
      .mockResolvedValueOnce(insertOk());

    // 40 * 2.5 = 100; amount = 99.99 → should NOT trigger
    await checkForAnomalies([baseTx({ amount: 99.99 })]);
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });

  test('no alert when amount equals average', async () => {
    mockQuery
      .mockResolvedValueOnce(histRow(50, 10))
      .mockResolvedValueOnce(insertOk());

    await checkForAnomalies([baseTx({ amount: 50 })]);
    expect(mockEvaluateAlertRules).not.toHaveBeenCalled();
  });

  test('alert description includes amount and average', async () => {
    mockQuery
      .mockResolvedValueOnce(histRow(20, 8))
      .mockResolvedValueOnce(insertOk());

    await checkForAnomalies([baseTx({ amount: 70 })]);
    const call = mockEvaluateAlertRules.mock.calls[0][0];
    expect(call.description).toContain('$70.00');
    expect(call.description).toContain('$20.00');
  });
});

// ── Inserts into history ──────────────────────────────────────────────────────

describe('checkForAnomalies – records transaction in merchant history', () => {
  test('inserts every processed debit transaction into history table', async () => {
    mockQuery
      .mockResolvedValueOnce(histRow(30, 5))
      .mockResolvedValueOnce(insertOk());

    await checkForAnomalies([baseTx({ amount: 35 })]);

    const insertCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO merchant_transaction_history')
    );
    expect(insertCall).toBeDefined();
    // Params are [merchantName, amount, date] — amount is a number
    expect(insertCall![1][1]).toBe(35);
  });

  test('stores merchant name in lowercase in the INSERT params', async () => {
    mockQuery
      .mockResolvedValueOnce(histRow(0, 0))
      .mockResolvedValueOnce(insertOk());

    // Description is uppercase; the source calls merchant.toLowerCase() before INSERT
    await checkForAnomalies([baseTx({ amount: 50, description: 'UPPER CASE MERCHANT' })]);

    const insertCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO merchant_transaction_history')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1][0]).toBe('upper case merchant');
  });
});

// ── DB errors handled ─────────────────────────────────────────────────────────

describe('checkForAnomalies – DB errors do not throw', () => {
  test('silently swallows DB errors', async () => {
    mockQuery.mockRejectedValue(new Error('DB down'));
    await expect(checkForAnomalies([baseTx({ amount: 200 })])).resolves.toBeUndefined();
  });
});
