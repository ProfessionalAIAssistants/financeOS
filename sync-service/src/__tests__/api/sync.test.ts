/**
 * Tests for /api/sync routes.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockSyncOFX = jest.fn().mockResolvedValue(undefined);
jest.mock('../../jobs/syncOFX', () => ({ syncOFX: mockSyncOFX }));

const mockRunFinanceDL = jest.fn().mockResolvedValue(undefined);
jest.mock('../../jobs/runFinanceDL', () => ({ runFinanceDL: mockRunFinanceDL }));

const mockSnapshotNetWorth = jest.fn().mockResolvedValue(undefined);
jest.mock('../../jobs/snapshotNetWorth', () => ({
  snapshotNetWorth: mockSnapshotNetWorth,
}));

const mockIsHealthy = jest.fn().mockResolvedValue(true);
jest.mock('../../firefly/client', () => ({
  isHealthy: mockIsHealthy,
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
import syncRouter from '../../api/routes/sync';

const app = express();
app.use(express.json());
app.use('/api/sync', syncRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/sync/status', () => {
  test('returns status with institution configs and firefly health', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ institution_name: 'chase', sync_method: 'ofx', last_sync_at: '2026-01-15' }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ institution_name: 'chase', status: 'success', transactions_added: 10 }],
    });
    const res = await request(app).get('/api/sync/status');
    expect(res.status).toBe(200);
    expect(res.body.data.institutions).toHaveLength(1);
    expect(res.body.data.firefly.healthy).toBe(true);
  });

  test('returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = await request(app).get('/api/sync/status');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/sync/log', () => {
  test('returns sync log entries', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'l1', institution_name: 'chase', status: 'success' }],
    });
    const res = await request(app).get('/api/sync/log');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('filters by institution', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/sync/log?institution=usaa');
    expect(mockQuery.mock.calls[0][0]).toContain('institution_name = $2');
  });

  test('clamps limit to 500', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/sync/log?limit=1000');
    const params = mockQuery.mock.calls[0][1];
    expect(params[params.length - 1]).toBe(500);
  });
});

describe('POST /api/sync/force', () => {
  test('starts sync in background', async () => {
    const res = await request(app)
      .post('/api/sync/force')
      .send({ institution: 'chase' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/sync/snapshot', () => {
  test('triggers net worth snapshot', async () => {
    const res = await request(app).post('/api/sync/snapshot');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
