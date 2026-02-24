/**
 * Tests for /api/networth routes.
 *
 * Mocks: db/client, snapshotNetWorth, middleware/auth
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockSnapshotNetWorth = jest.fn().mockResolvedValue(undefined);
jest.mock('../../jobs/snapshotNetWorth', () => ({
  snapshotNetWorth: mockSnapshotNetWorth,
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
import networthRouter from '../../api/routes/networth';

const app = express();
app.use(express.json());
app.use('/api/networth', networthRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/networth/current', () => {
  test('returns latest snapshot', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ snapshot_date: '2026-01-15', net_worth: 50000, total_assets: 80000, total_liabilities: 30000 }],
    });
    const res = await request(app).get('/api/networth/current');
    expect(res.status).toBe(200);
    expect(res.body.data.net_worth).toBe(50000);
  });

  test('returns null when no snapshots exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/networth/current');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  test('returns 500 on error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('fail'));
    const res = await request(app).get('/api/networth/current');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/networth/history', () => {
  test('returns history with default 365 days', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ snapshot_date: '2025-06-01', net_worth: 40000 }] });
    const res = await request(app).get('/api/networth/history');
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[0][1]).toContain('365 days');
  });

  test('accepts custom days parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/networth/history?days=90');
    expect(mockQuery.mock.calls[0][1]).toContain('90 days');
  });
});

describe('GET /api/networth/breakdown', () => {
  test('returns breakdown', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ breakdown: { 'Checking': 5000 } }] });
    const res = await request(app).get('/api/networth/breakdown');
    expect(res.status).toBe(200);
    expect(res.body.data.Checking).toBe(5000);
  });

  test('returns empty object when no breakdown', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/networth/breakdown');
    expect(res.body.data).toEqual({});
  });
});

describe('POST /api/networth/snapshot', () => {
  test('triggers snapshot and returns latest', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 's1', net_worth: 55000 }] });
    const res = await request(app).post('/api/networth/snapshot');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSnapshotNetWorth).toHaveBeenCalledWith('user-1');
  });

  test('returns 500 on error', async () => {
    mockSnapshotNetWorth.mockRejectedValueOnce(new Error('fail'));
    const res = await request(app).post('/api/networth/snapshot');
    expect(res.status).toBe(500);
  });
});
