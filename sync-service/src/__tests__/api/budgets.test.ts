/**
 * Integration tests for /api/budgets routes.
 *
 * All Firefly client functions are mocked — no real HTTP calls go out.
 */

const mockGetBudgets            = jest.fn();
const mockGetBudget             = jest.fn();
const mockCreateBudget          = jest.fn();
const mockUpdateBudget          = jest.fn();
const mockDeleteBudget          = jest.fn();
const mockGetBudgetLimits       = jest.fn();
const mockCreateBudgetLimit     = jest.fn();
const mockUpdateBudgetLimit     = jest.fn();
const mockDeleteBudgetLimit     = jest.fn();
const mockGetBudgetTransactions = jest.fn();

jest.mock('../../firefly/client', () => ({
  getBudgets:            mockGetBudgets,
  getBudget:             mockGetBudget,
  createBudget:          mockCreateBudget,
  updateBudget:          mockUpdateBudget,
  deleteBudget:          mockDeleteBudget,
  getBudgetLimits:       mockGetBudgetLimits,
  createBudgetLimit:     mockCreateBudgetLimit,
  updateBudgetLimit:     mockUpdateBudgetLimit,
  deleteBudgetLimit:     mockDeleteBudgetLimit,
  getBudgetTransactions: mockGetBudgetTransactions,
}));

import express from 'express';
import request from 'supertest';
import budgetsRouter from '../../api/routes/budgets';

const app = express();
app.use(express.json());
app.use('/api/budgets', budgetsRouter);

// Fake budget fixture
const BUDGET = { id: '1', attributes: { name: 'Groceries', active: true } };
const LIMIT  = { id: '10', attributes: { amount: '500.00', start: '2026-01-01', end: '2026-01-31' } };

afterEach(() => jest.clearAllMocks());

// ── GET /api/budgets ──────────────────────────────────────────────────────────

describe('GET /api/budgets', () => {
  test('returns 200 with budget list', async () => {
    mockGetBudgets.mockResolvedValue([BUDGET]);
    const res = await request(app).get('/api/budgets');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('1');
  });

  test('returns 500 when Firefly client throws', async () => {
    mockGetBudgets.mockRejectedValue(new Error('Firefly down'));
    const res = await request(app).get('/api/budgets');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch budgets');
  });
});

// ── GET /api/budgets/:id ──────────────────────────────────────────────────────

describe('GET /api/budgets/:id', () => {
  test('returns 200 with single budget', async () => {
    mockGetBudget.mockResolvedValue(BUDGET);
    const res = await request(app).get('/api/budgets/1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('1');
  });

  test('returns 500 when budget not found (client throws)', async () => {
    mockGetBudget.mockRejectedValue(new Error('Not found'));
    const res = await request(app).get('/api/budgets/999');
    expect(res.status).toBe(500);
  });
});

// ── POST /api/budgets ─────────────────────────────────────────────────────────

describe('POST /api/budgets', () => {
  test('creates budget and returns 201', async () => {
    mockCreateBudget.mockResolvedValue(BUDGET);
    const res = await request(app)
      .post('/api/budgets')
      .send({ name: 'Groceries', active: true });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('1');
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/budgets').send({ active: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('passes optional fields to Firefly client', async () => {
    mockCreateBudget.mockResolvedValue(BUDGET);
    await request(app).post('/api/budgets').send({
      name: 'Entertainment',
      auto_budget_type: 'reset',
      auto_budget_amount: '200',
      auto_budget_period: 'monthly',
    });
    expect(mockCreateBudget).toHaveBeenCalledWith(
      expect.objectContaining({ auto_budget_type: 'reset' })
    );
  });

  test('returns 500 when Firefly client throws', async () => {
    mockCreateBudget.mockRejectedValue(new Error('API error'));
    const res = await request(app).post('/api/budgets').send({ name: 'Test' });
    expect(res.status).toBe(500);
  });
});

// ── PUT /api/budgets/:id ──────────────────────────────────────────────────────

describe('PUT /api/budgets/:id', () => {
  test('returns 200 with updated budget', async () => {
    mockUpdateBudget.mockResolvedValue({ ...BUDGET, attributes: { name: 'Food' } });
    const res = await request(app).put('/api/budgets/1').send({ name: 'Food' });
    expect(res.status).toBe(200);
  });

  test('returns 500 when update fails', async () => {
    mockUpdateBudget.mockRejectedValue(new Error('Update failed'));
    const res = await request(app).put('/api/budgets/1').send({ name: 'Food' });
    expect(res.status).toBe(500);
  });
});

// ── DELETE /api/budgets/:id ───────────────────────────────────────────────────

describe('DELETE /api/budgets/:id', () => {
  test('returns 200 with success on delete', async () => {
    mockDeleteBudget.mockResolvedValue(undefined);
    const res = await request(app).delete('/api/budgets/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('calls deleteBudget with correct id', async () => {
    mockDeleteBudget.mockResolvedValue(undefined);
    await request(app).delete('/api/budgets/42');
    expect(mockDeleteBudget).toHaveBeenCalledWith('42');
  });

  test('returns 500 when delete fails', async () => {
    mockDeleteBudget.mockRejectedValue(new Error('Delete failed'));
    const res = await request(app).delete('/api/budgets/1');
    expect(res.status).toBe(500);
  });
});

// ── GET /api/budgets/:id/limits ───────────────────────────────────────────────

describe('GET /api/budgets/:id/limits', () => {
  test('returns budget limits', async () => {
    mockGetBudgetLimits.mockResolvedValue([LIMIT]);
    const res = await request(app).get('/api/budgets/1/limits');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('forwards start/end query params to client', async () => {
    mockGetBudgetLimits.mockResolvedValue([]);
    await request(app).get('/api/budgets/1/limits?start=2026-01-01&end=2026-01-31');
    expect(mockGetBudgetLimits).toHaveBeenCalledWith('1', '2026-01-01', '2026-01-31');
  });
});

// ── POST /api/budgets/:id/limits ──────────────────────────────────────────────

describe('POST /api/budgets/:id/limits', () => {
  test('creates budget limit and returns 201', async () => {
    mockCreateBudgetLimit.mockResolvedValue(LIMIT);
    const res = await request(app)
      .post('/api/budgets/1/limits')
      .send({ start: '2026-01-01', end: '2026-01-31', amount: '500' });
    expect(res.status).toBe(201);
  });

  test('returns 400 when required fields missing', async () => {
    const res = await request(app).post('/api/budgets/1/limits').send({ start: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start.*end.*amount|required/i);
  });
});

// ── GET /api/budgets/:id/transactions ─────────────────────────────────────────

describe('GET /api/budgets/:id/transactions', () => {
  test('returns budget transactions', async () => {
    mockGetBudgetTransactions.mockResolvedValue([{ id: 'tx1' }]);
    const res = await request(app).get('/api/budgets/1/transactions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('passes page/limit params', async () => {
    mockGetBudgetTransactions.mockResolvedValue([]);
    await request(app).get('/api/budgets/1/transactions?page=2&limit=25');
    expect(mockGetBudgetTransactions).toHaveBeenCalledWith('1', undefined, undefined, 2, 25);
  });
});
