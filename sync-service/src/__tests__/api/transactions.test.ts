/**
 * Integration tests for /api/transactions routes.
 *
 * All Firefly client functions are mocked.
 */

const mockGetTransactions  = jest.fn();
const mockGetTransaction   = jest.fn();
const mockCreateTransaction = jest.fn();
const mockUpdateTransaction = jest.fn();
const mockDeleteTransaction = jest.fn();
const mockGetAccounts      = jest.fn();
const mockGetCategories    = jest.fn();
const mockCreateCategory   = jest.fn();

jest.mock('../../firefly/client', () => ({
  getTransactions:   mockGetTransactions,
  getTransaction:    mockGetTransaction,
  createTransaction: mockCreateTransaction,
  updateTransaction: mockUpdateTransaction,
  deleteTransaction: mockDeleteTransaction,
  getAccounts:       mockGetAccounts,
  getCategories:     mockGetCategories,
  createCategory:    mockCreateCategory,
}));

import express from 'express';
import request from 'supertest';
import transactionsRouter from '../../api/routes/transactions';

const app = express();
app.use(express.json());
app.use('/api/transactions', transactionsRouter);

// ─── Test fixtures ──────────────────────────────────────────────────────────

const ACCOUNT = {
  id: 'acc1',
  attributes: {
    name: 'Checking',
    type: 'asset',
    current_balance: '1000.00',
    currency_symbol: '$',
  },
};

const CATEGORY = { id: 'cat1', attributes: { name: 'Groceries' } };

// Firefly transaction group structure
const TX_GROUP = {
  id: 'grp1',
  attributes: {
    transactions: [
      {
        transaction_journal_id: 'j1',
        date: '2026-01-10T00:00:00+00:00',
        description: 'AMAZON MARKETPLACE',
        amount: '45.99',
        type: 'withdrawal',
        category_name: 'Shopping',
        category_id: 'cat2',
        source_name: 'Checking',
        source_id: 'acc1',
        destination_name: 'Amazon',
        destination_id: null,
        tags: [],
        notes: null,
        currency_symbol: '$',
        reconciled: false,
        budget_name: null,
        budget_id: null,
      },
    ],
  },
};

afterEach(() => jest.clearAllMocks());

// ── GET /api/transactions/meta/accounts ──────────────────────────────────────

describe('GET /api/transactions/meta/accounts', () => {
  test('returns 200 with simplified account list', async () => {
    mockGetAccounts.mockResolvedValue([ACCOUNT]);
    const res = await request(app).get('/api/transactions/meta/accounts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('acc1');
    expect(res.body.data[0].name).toBe('Checking');
  });

  test('includes currency_symbol with $ default', async () => {
    mockGetAccounts.mockResolvedValue([{ id: 'a1', attributes: { name: 'Savings', type: 'asset', current_balance: '500' } }]);
    const res = await request(app).get('/api/transactions/meta/accounts');
    expect(res.body.data[0].currency_symbol).toBe('$');
  });

  test('returns 500 when client throws', async () => {
    mockGetAccounts.mockRejectedValue(new Error('Firefly down'));
    const res = await request(app).get('/api/transactions/meta/accounts');
    expect(res.status).toBe(500);
  });
});

// ── GET /api/transactions/meta/categories ────────────────────────────────────

describe('GET /api/transactions/meta/categories', () => {
  test('returns 200 with category list', async () => {
    mockGetCategories.mockResolvedValue([CATEGORY]);
    const res = await request(app).get('/api/transactions/meta/categories');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Groceries');
  });

  test('returns 500 when client throws', async () => {
    mockGetCategories.mockRejectedValue(new Error('Error'));
    const res = await request(app).get('/api/transactions/meta/categories');
    expect(res.status).toBe(500);
  });
});

// ── POST /api/transactions/meta/categories ───────────────────────────────────

describe('POST /api/transactions/meta/categories', () => {
  test('creates and returns new category with 201', async () => {
    mockCreateCategory.mockResolvedValue(CATEGORY);
    const res = await request(app)
      .post('/api/transactions/meta/categories')
      .send({ name: 'Groceries' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Groceries');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/transactions/meta/categories').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });
});

// ── GET /api/transactions ─────────────────────────────────────────────────────

describe('GET /api/transactions', () => {
  test('returns 200 with flattened transaction list', async () => {
    mockGetTransactions.mockResolvedValue([TX_GROUP]);
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].description).toBe('AMAZON MARKETPLACE');
  });

  test('flattens multiple splits from one group', async () => {
    const multiSplit = {
      id: 'grp2',
      attributes: {
        transactions: [
          { ...TX_GROUP.attributes.transactions[0], description: 'Split A' },
          { ...TX_GROUP.attributes.transactions[0], description: 'Split B' },
        ],
      },
    };
    mockGetTransactions.mockResolvedValue([multiSplit]);
    const res = await request(app).get('/api/transactions');
    expect(res.body.data).toHaveLength(2);
  });

  test('passes page and limit to Firefly client', async () => {
    mockGetTransactions.mockResolvedValue([]);
    await request(app).get('/api/transactions?page=3&limit=20');
    expect(mockGetTransactions).toHaveBeenCalledWith(3, 20, undefined, undefined, undefined, undefined, undefined);
  });

  test('passes type filter to Firefly client', async () => {
    mockGetTransactions.mockResolvedValue([]);
    await request(app).get('/api/transactions?type=withdrawal');
    expect(mockGetTransactions).toHaveBeenCalledWith(1, 50, 'withdrawal', undefined, undefined, undefined, undefined);
  });

  test('passes date range to Firefly client', async () => {
    mockGetTransactions.mockResolvedValue([]);
    await request(app).get('/api/transactions?start=2026-01-01&end=2026-01-31');
    expect(mockGetTransactions).toHaveBeenCalledWith(1, 50, undefined, undefined, undefined, '2026-01-01', '2026-01-31');
  });

  test('returns 500 on Firefly error', async () => {
    mockGetTransactions.mockRejectedValue(new Error('Firefly error'));
    const res = await request(app).get('/api/transactions');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch transactions');
  });
});

// ── GET /api/transactions/:id ─────────────────────────────────────────────────

describe('GET /api/transactions/:id', () => {
  test('returns 200 with transaction data', async () => {
    mockGetTransaction.mockResolvedValue(TX_GROUP);
    const res = await request(app).get('/api/transactions/grp1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('grp1');
  });

  test('returns 500 when transaction not found', async () => {
    mockGetTransaction.mockRejectedValue(new Error('Not found'));
    const res = await request(app).get('/api/transactions/999');
    expect(res.status).toBe(500);
  });
});

// ── POST /api/transactions ────────────────────────────────────────────────────

describe('POST /api/transactions', () => {
  const validBody = {
    type: 'withdrawal',
    date: '2026-01-10',
    description: 'Coffee',
    amount: 5.50,
    source_name: 'Checking',
  };

  test('creates transaction and returns 201', async () => {
    mockCreateTransaction.mockResolvedValue(TX_GROUP);
    const res = await request(app).post('/api/transactions').send(validBody);
    expect(res.status).toBe(201);
  });

  test('returns 400 when type is missing', async () => {
    const { type, ...noType } = validBody;
    const res = await request(app).post('/api/transactions').send(noType);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('returns 400 when date is missing', async () => {
    const { date, ...noDate } = validBody;
    const res = await request(app).post('/api/transactions').send(noDate);
    expect(res.status).toBe(400);
  });

  test('returns 400 when description is missing', async () => {
    const { description, ...noDesc } = validBody;
    const res = await request(app).post('/api/transactions').send(noDesc);
    expect(res.status).toBe(400);
  });

  test('returns 400 when amount is missing', async () => {
    const { amount, ...noAmt } = validBody;
    const res = await request(app).post('/api/transactions').send(noAmt);
    expect(res.status).toBe(400);
  });

  test('passes amount as string to Firefly', async () => {
    mockCreateTransaction.mockResolvedValue(TX_GROUP);
    await request(app).post('/api/transactions').send(validBody);
    const payload = mockCreateTransaction.mock.calls[0][0];
    expect(typeof payload.amount).toBe('string');
  });

  test('returns 500 when Firefly throws', async () => {
    mockCreateTransaction.mockRejectedValue(new Error('API error'));
    const res = await request(app).post('/api/transactions').send(validBody);
    expect(res.status).toBe(500);
  });
});

// ── PUT /api/transactions/:id ─────────────────────────────────────────────────

describe('PUT /api/transactions/:id', () => {
  test('returns 200 with updated transaction', async () => {
    mockUpdateTransaction.mockResolvedValue(TX_GROUP);
    const res = await request(app).put('/api/transactions/grp1').send({ description: 'Updated' });
    expect(res.status).toBe(200);
  });

  test('returns 400 when body has no fields', async () => {
    const res = await request(app).put('/api/transactions/grp1').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No fields to update/i);
  });

  test('converts amount to string in update payload', async () => {
    mockUpdateTransaction.mockResolvedValue(TX_GROUP);
    await request(app).put('/api/transactions/grp1').send({ amount: 99.99 });
    const payload = mockUpdateTransaction.mock.calls[0][1];
    expect(typeof payload.amount).toBe('string');
  });

  test('returns 500 when update fails', async () => {
    mockUpdateTransaction.mockRejectedValue(new Error('Error'));
    const res = await request(app).put('/api/transactions/grp1').send({ description: 'x' });
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/transactions/:id ──────────────────────────────────────────────

describe('DELETE /api/transactions/:id', () => {
  test('returns 200 with success: true', async () => {
    mockDeleteTransaction.mockResolvedValue(undefined);
    const res = await request(app).delete('/api/transactions/grp1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('calls deleteTransaction with correct id', async () => {
    mockDeleteTransaction.mockResolvedValue(undefined);
    await request(app).delete('/api/transactions/grp42');
    expect(mockDeleteTransaction).toHaveBeenCalledWith('grp42');
  });

  test('returns 500 when delete fails', async () => {
    mockDeleteTransaction.mockRejectedValue(new Error('Delete error'));
    const res = await request(app).delete('/api/transactions/grp1');
    expect(res.status).toBe(500);
  });
});
