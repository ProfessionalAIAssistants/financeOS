/**
 * Tests for /api/forecasting routes.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockRunForecasting = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/forecasting', () => ({
  runForecasting: mockRunForecasting,
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
import forecastingRouter from '../../api/routes/forecasting';

const app = express();
app.use(express.json());
app.use('/api/forecasting', forecastingRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/forecasting/latest', () => {
  test('returns latest forecast with default horizon', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'f1', horizon_months: 12, scenarios: { base: [] } }],
    });
    const res = await request(app).get('/api/forecasting/latest');
    expect(res.status).toBe(200);
    expect(res.body.data.horizon_months).toBe(12);
  });

  test('accepts custom horizon parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/forecasting/latest?horizon=60');
    expect(mockQuery.mock.calls[0][1]).toContain(60);
  });

  test('clamps horizon to 1-120', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/forecasting/latest?horizon=200');
    expect(mockQuery.mock.calls[0][1]).toContain(120);
  });

  test('returns null when no forecast found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/forecasting/latest');
    expect(res.body.data).toBeNull();
  });
});

describe('GET /api/forecasting/history', () => {
  test('returns forecast history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'f1' }, { id: 'f2' }] });
    const res = await request(app).get('/api/forecasting/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('GET /api/forecasting/:id', () => {
  test('returns specific forecast', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'f1', scenarios: {} }] });
    const res = await request(app).get('/api/forecasting/f1');
    expect(res.status).toBe(200);
  });

  test('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/forecasting/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/forecasting/generate', () => {
  test('starts forecast generation', async () => {
    const res = await request(app)
      .post('/api/forecasting/generate')
      .send({ horizon: 24 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/forecasting/whatif', () => {
  test('computes what-if scenario', async () => {
    // scenarios query
    mockQuery.mockResolvedValueOnce({
      rows: [{ scenarios: { base: [{ month: 0, netWorth: 50000 }, { month: 1, netWorth: 51000 }] } }],
    });
    // stats query
    mockQuery.mockResolvedValueOnce({
      rows: [{ avg_income: '5000', avg_expenses: '3000' }],
    });
    const res = await request(app)
      .post('/api/forecasting/whatif')
      .send({ incomeChangePct: 10, expenseChangePct: -5, extraMonthlySavings: 200, horizon: 12 });
    expect(res.status).toBe(200);
    expect(res.body.data.baseline).toHaveLength(2);
    expect(res.body.data.whatIf).toHaveLength(2);
    expect(res.body.data.assumptions).toBeDefined();
  });

  test('returns 404 when no baseline forecast exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/forecasting/whatif')
      .send({});
    expect(res.status).toBe(404);
  });
});
