/**
 * Tests for /api/insights routes.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockGenerateMonthlyInsights = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/insights', () => ({
  generateMonthlyInsights: mockGenerateMonthlyInsights,
}));

const mockGetCategorySpending = jest.fn();
jest.mock('../../firefly/client', () => ({
  getCategorySpending: mockGetCategorySpending,
}));

jest.mock('../../middleware/auth', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getUserId: () => 'user-1',
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import insightsRouter from '../../api/routes/insights';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/insights', () => {
  test('returns insights list', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'i1', title: 'Monthly Insights', rule_type: 'monthly_insights' }],
    });
    const res = await request(app).get('/api/insights');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('clamps limit to 1-100', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/insights?limit=500');
    expect(mockQuery.mock.calls[0][1]).toContain(100);
  });
});

describe('GET /api/insights/latest', () => {
  test('returns latest insight', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'i1', title: 'Jan 2026 Insights' }],
    });
    const res = await request(app).get('/api/insights/latest');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Jan 2026 Insights');
  });

  test('returns null when none exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/insights/latest');
    expect(res.body.data).toBeNull();
  });
});

describe('POST /api/insights/generate', () => {
  test('starts insight generation', async () => {
    const res = await request(app)
      .post('/api/insights/generate')
      .send({ year: 2026, month: 1 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/insights/spending', () => {
  test('returns spending data', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ month: '2026-01', expenses: '3000', income: '5000' }],
    });
    const res = await request(app).get('/api/insights/spending');
    expect(res.status).toBe(200);
  });

  test('clamps months to 1-60', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/insights/spending?months=100');
    expect(mockQuery.mock.calls[0][1]).toContain(60);
  });
});

describe('GET /api/insights/categories', () => {
  test('returns category spending breakdown', async () => {
    mockGetCategorySpending.mockResolvedValueOnce([
      { attributes: { name: 'Groceries', spent: [{ sum: '-500.00' }] } },
      { attributes: { name: 'Entertainment', spent: [{ sum: '-200.00' }] } },
    ]);
    const res = await request(app).get('/api/insights/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.byCategory).toHaveLength(2);
    expect(res.body.data.byCategory[0].total).toBe(500);
  });

  test('filters out zero-spend categories', async () => {
    mockGetCategorySpending.mockResolvedValueOnce([
      { attributes: { name: 'Income', spent: [{ sum: '0' }] } },
    ]);
    const res = await request(app).get('/api/insights/categories');
    expect(res.body.data.byCategory).toHaveLength(0);
  });
});

describe('GET /api/insights/savings-rate', () => {
  test('computes savings rate from income/expenses', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ snapshot_date: '2026-01-15', income: '5000', expenses: '3500' }],
    });
    const res = await request(app).get('/api/insights/savings-rate');
    expect(res.status).toBe(200);
    expect(res.body.data[0].savingsRate).toBe(30); // (5000-3500)/5000*100 = 30
  });
});

describe('GET /api/insights/emergency-fund', () => {
  test('calculates emergency fund metrics', async () => {
    // Latest snapshot
    mockQuery.mockResolvedValueOnce({ rows: [{ total_assets: '100000' }] });
    // Illiquid assets
    mockQuery.mockResolvedValueOnce({ rows: [{ illiquid_total: '60000' }] });
    // Avg monthly expenses
    mockQuery.mockResolvedValueOnce({ rows: [{ avg_exp: '4000' }] });

    const res = await request(app).get('/api/insights/emergency-fund');
    expect(res.status).toBe(200);
    // Liquid = 100k - 60k = 40k. Months = 40k / 4k = 10
    expect(res.body.data.liquidAssets).toBe(40000);
    expect(res.body.data.monthsCovered).toBe(10);
    expect(res.body.data.targetMonths).toBe(6);
  });

  test('returns null when no snapshot exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/insights/emergency-fund');
    expect(res.body.data).toBeNull();
  });
});
