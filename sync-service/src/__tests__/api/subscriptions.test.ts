/**
 * Tests for /api/subscriptions routes.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockDetectSubscriptions = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/subscriptions', () => ({
  detectSubscriptions: mockDetectSubscriptions,
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
import subsRouter from '../../api/routes/subscriptions';

const app = express();
app.use(express.json());
app.use('/api/subscriptions', subsRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/subscriptions', () => {
  test('returns active subscriptions by default', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 's1', name: 'Netflix', amount: 15.99, status: 'active' }],
    });
    const res = await request(app).get('/api/subscriptions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockQuery.mock.calls[0][0]).toContain('status = $2');
  });

  test('returns all subscriptions when status=all', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/subscriptions?status=all');
    expect(mockQuery.mock.calls[0][0]).not.toContain('status = $2');
  });

  test('returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = await request(app).get('/api/subscriptions');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/subscriptions/summary', () => {
  test('returns summary by status and category', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'active', count: '5', annual_cost: '720.00' }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ category: 'streaming', monthly_total: '30', count: '2' }],
    });
    const res = await request(app).get('/api/subscriptions/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.byStatus).toHaveLength(1);
    expect(res.body.data.byCategory).toHaveLength(1);
  });
});

describe('PUT /api/subscriptions/:id', () => {
  test('updates subscription fields', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/subscriptions/s1')
      .send({ status: 'cancelled', name: 'Netflix Premium' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 400 when no fields', async () => {
    const res = await request(app)
      .put('/api/subscriptions/s1')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/subscriptions/:id', () => {
  test('deletes subscription', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/subscriptions/s1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/subscriptions/detect', () => {
  test('starts detection', async () => {
    const res = await request(app).post('/api/subscriptions/detect');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
