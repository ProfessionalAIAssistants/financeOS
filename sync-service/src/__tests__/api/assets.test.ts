/**
 * Tests for /api/assets routes.
 */

const mockQuery = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery, transaction: mockTransaction }));

const mockFetchPropertyValue = jest.fn().mockResolvedValue(null);
jest.mock('../../assets/propertyValuation', () => ({
  fetchPropertyValue: mockFetchPropertyValue,
}));

const mockDecodeVIN = jest.fn().mockResolvedValue(null);
jest.mock('../../assets/vinDecoder', () => ({
  decodeVIN: mockDecodeVIN,
}));

jest.mock('../../assets/amortization', () => ({
  calculateAmortization: jest.fn().mockReturnValue({
    monthlyPayment: 1000, currentBalance: 180000, monthsRemaining: 300,
    payoffDate: '2046-01-01', schedule: [],
  }),
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
import assetsRouter from '../../api/routes/assets';

const app = express();
app.use(express.json());
app.use('/api/assets', assetsRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/assets', () => {
  test('returns assets list', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'a1', name: 'House', asset_type: 'real_estate', current_value: '300000', payment_count: '0' }],
    });
    const res = await request(app).get('/api/assets');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('attaches amortization for note assets', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a2', name: 'Note', asset_type: 'note_receivable', current_value: '50000',
        note_principal: '50000', note_rate: '5', note_term_months: '120',
        note_start_date: '2025-01-01', payment_count: '6',
      }],
    });
    const res = await request(app).get('/api/assets');
    expect(res.body.data[0].amortization).toBeDefined();
    expect(res.body.data[0].amortization.monthlyPayment).toBe(1000);
  });
});

describe('POST /api/assets', () => {
  test('creates a real estate asset with property valuation', async () => {
    mockFetchPropertyValue.mockResolvedValueOnce({ value: 350000, source: 'homesage' });
    mockTransaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const clientMock = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'new-1', name: 'My House' }] }) };
      return fn(clientMock);
    });
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'My House', assetType: 'real_estate', address: '123 Main', city: 'Town', state: 'CA' });
    expect(res.status).toBe(201);
    expect(mockFetchPropertyValue).toHaveBeenCalled();
  });

  test('creates a vehicle asset with VIN decode', async () => {
    mockDecodeVIN.mockResolvedValueOnce({ year: 2022, make: 'Toyota', model: 'Camry' });
    mockTransaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const clientMock = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'v1', name: 'Car' }] }) };
      return fn(clientMock);
    });
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'Car', assetType: 'vehicle', vin: '1HGCM82633A004352', currentValue: 25000 });
    expect(res.status).toBe(201);
    expect(mockDecodeVIN).toHaveBeenCalledWith('1HGCM82633A004352');
  });

  test('returns 500 on error', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('DB fail'));
    const res = await request(app)
      .post('/api/assets')
      .send({ name: 'Test', assetType: 'other' });
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/assets/:id', () => {
  test('updates allowed fields', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .put('/api/assets/a1')
      .send({ name: 'Updated House', currentValue: 320000 });
    expect(res.status).toBe(200);
  });

  test('returns 400 with no fields', async () => {
    const res = await request(app).put('/api/assets/a1').send({});
    expect(res.status).toBe(400);
  });

  test('ignores unknown fields', async () => {
    const res = await request(app)
      .put('/api/assets/a1')
      .send({ hackerField: 'DROP TABLE' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No valid fields/);
  });
});

describe('DELETE /api/assets/:id', () => {
  test('soft deletes asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/assets/a1');
    expect(res.status).toBe(200);
    // Verify it sets is_active = false rather than hard delete
    expect(mockQuery.mock.calls[0][0]).toContain('is_active = false');
  });
});

describe('GET /api/assets/:id/history', () => {
  test('returns asset value history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1' }] }); // ownership check
    mockQuery.mockResolvedValueOnce({
      rows: [{ recorded_date: '2026-01-01', value: 300000, value_source: 'manual' }],
    });
    const res = await request(app).get('/api/assets/a1/history');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('returns 404 when not owned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/assets/a1/history');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/assets/:id/amortization', () => {
  test('returns amortization schedule', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'a2', note_principal: '50000', note_rate: '5', note_term_months: '120', note_start_date: '2025-01-01' }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '6' }] });
    const res = await request(app).get('/api/assets/a2/amortization');
    expect(res.status).toBe(200);
    expect(res.body.data.monthlyPayment).toBe(1000);
  });

  test('returns 404 when asset not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/assets/nonexistent/amortization');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/assets/:id/note-payment', () => {
  test('records a note payment', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'a2', note_principal: '50000', note_rate: '5', note_term_months: '120', note_start_date: '2025-01-01' }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: '5' }] });
    mockTransaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const clientMock = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'p1' }] }) };
      return fn(clientMock);
    });
    const res = await request(app)
      .post('/api/assets/a2/note-payment')
      .send({ paymentDate: '2026-01-15', amountPaid: 1000 });
    expect(res.status).toBe(201);
  });

  test('returns 404 when asset not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/assets/nonexistent/note-payment')
      .send({ paymentDate: '2026-01-15', amountPaid: 1000 });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/assets/:id/payments', () => {
  test('returns payment history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a2' }] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p1', payment_date: '2026-01-15', amount_paid: '1000' }],
    });
    const res = await request(app).get('/api/assets/a2/payments');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
