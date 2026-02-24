/**
 * Tests for /api/alerts routes.
 *
 * Mocks: db/client, alerts/ntfy, middleware/auth
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockSendPushNotification = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/ntfy', () => ({
  sendPushNotification: mockSendPushNotification,
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
import alertsRouter from '../../api/routes/alerts';

const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);

afterEach(() => jest.clearAllMocks());

// ── GET /api/alerts ──────────────────────────────────────────────────────────

describe('GET /api/alerts', () => {
  test('returns alerts list', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: '1', title: 'Low balance', severity: 'warning' }],
    });
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('filters by unread', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/alerts?unread=true');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toContain('read_at IS NULL');
  });

  test('filters by severity', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/alerts?severity=critical');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][0]).toContain('severity = $2');
  });

  test('returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(500);
  });
});

// ── GET /api/alerts/unread-count ─────────────────────────────────────────────

describe('GET /api/alerts/unread-count', () => {
  test('returns unread count', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });
    const res = await request(app).get('/api/alerts/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(5);
  });
});

// ── PUT /api/alerts/read-all ─────────────────────────────────────────────────

describe('PUT /api/alerts/read-all', () => {
  test('marks all as read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/api/alerts/read-all');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── PUT /api/alerts/:id/read ─────────────────────────────────────────────────

describe('PUT /api/alerts/:id/read', () => {
  test('marks single alert as read', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).put('/api/alerts/alert-1/read');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toContain('alert-1');
  });
});

// ── DELETE /api/alerts/:id ───────────────────────────────────────────────────

describe('DELETE /api/alerts/:id', () => {
  test('deletes alert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/alerts/alert-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── GET /api/alerts/rules ────────────────────────────────────────────────────

describe('GET /api/alerts/rules', () => {
  test('returns rules list', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'r1', rule_type: 'low_balance', threshold: 500 }],
    });
    const res = await request(app).get('/api/alerts/rules');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

// ── POST /api/alerts/rules ───────────────────────────────────────────────────

describe('POST /api/alerts/rules', () => {
  test('creates a rule', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'r2', rule_type: 'large_transaction', threshold: 1000 }],
    });
    const res = await request(app)
      .post('/api/alerts/rules')
      .send({ ruleType: 'large_transaction', threshold: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.data.rule_type).toBe('large_transaction');
  });
});

// ── PUT /api/alerts/rules/:id ────────────────────────────────────────────────

describe('PUT /api/alerts/rules/:id', () => {
  test('updates a rule', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/alerts/rules/r1')
      .send({ threshold: 200, enabled: true });
    expect(res.status).toBe(200);
  });

  test('returns 400 when no fields provided', async () => {
    const res = await request(app)
      .put('/api/alerts/rules/r1')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/alerts/rules/:id ─────────────────────────────────────────────

describe('DELETE /api/alerts/rules/:id', () => {
  test('deletes a rule', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/alerts/rules/r1');
    expect(res.status).toBe(200);
  });
});

// ── POST /api/alerts/test ────────────────────────────────────────────────────

describe('POST /api/alerts/test', () => {
  test('sends test notification', async () => {
    const res = await request(app).post('/api/alerts/test');
    expect(res.status).toBe(200);
    expect(mockSendPushNotification).toHaveBeenCalledTimes(1);
  });

  test('returns 500 when push fails', async () => {
    mockSendPushNotification.mockRejectedValueOnce(new Error('push fail'));
    const res = await request(app).post('/api/alerts/test');
    expect(res.status).toBe(500);
  });
});
