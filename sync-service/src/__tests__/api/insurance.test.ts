/**
 * Tests for /api/insurance routes.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

jest.mock('../../config', () => ({
  config: { openaiApiKey: '' }, // no AI in tests
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
import insuranceRouter from '../../api/routes/insurance';

const app = express();
app.use(express.json());
app.use('/api/insurance', insuranceRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/insurance', () => {
  test('returns policies list', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p1', policy_type: 'auto', provider: 'Geico' }],
    });
    const res = await request(app).get('/api/insurance');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/insurance/summary/annual-cost', () => {
  test('returns annual cost by policy type', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ policy_type: 'auto', annual_cost: '1200' }],
    });
    const res = await request(app).get('/api/insurance/summary/annual-cost');
    expect(res.status).toBe(200);
    expect(res.body.data[0].annual_cost).toBe('1200');
  });
});

describe('GET /api/insurance/:id', () => {
  test('returns single policy', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p1', policy_type: 'home', provider: 'StateFarm' }],
    });
    const res = await request(app).get('/api/insurance/p1');
    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('StateFarm');
  });

  test('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/insurance/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/insurance', () => {
  test('creates a policy', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p2', policy_type: 'life', provider: 'MetLife' }],
    });
    const res = await request(app)
      .post('/api/insurance')
      .send({ policyType: 'life', provider: 'MetLife', premiumAmount: 50, premiumFrequency: 'monthly' });
    expect(res.status).toBe(201);
    expect(res.body.data.policy_type).toBe('life');
  });
});

describe('PUT /api/insurance/:id', () => {
  test('updates allowed fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/insurance/p1')
      .send({ premiumAmount: 75, deductible: 500 });
    expect(res.status).toBe(200);
  });

  test('returns 400 with no fields', async () => {
    const res = await request(app).put('/api/insurance/p1').send({});
    expect(res.status).toBe(400);
  });

  test('ignores unknown fields', async () => {
    const res = await request(app)
      .put('/api/insurance/p1')
      .send({ unknownField: 'value' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/insurance/:id', () => {
  test('deletes policy', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/insurance/p1');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/insurance/:id/ai-review', () => {
  test('generates fallback review when no AI key', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'p1', policy_type: 'auto', provider: 'Geico', coverage_amount: '100000',
        premium_amount: '100', premium_frequency: 'monthly', deductible: '500',
        renewal_date: null,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ net_worth: '200000', total_assets: '300000' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update ai_review
    const res = await request(app).post('/api/insurance/p1/ai-review');
    expect(res.status).toBe(200);
    expect(res.body.data.review).toBeTruthy();
  });

  test('returns 404 when policy not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/insurance/nonexistent/ai-review');
    expect(res.status).toBe(404);
  });
});
