/**
 * Tests for /api/tags routes.
 *
 * Mocks: firefly/client, logger
 */

const mockGetTags = jest.fn();
const mockCreateTag = jest.fn();
const mockUpdateTag = jest.fn();
const mockDeleteTag = jest.fn();
const mockGetTagTransactions = jest.fn();

jest.mock('../../firefly/client', () => ({
  getTags: mockGetTags,
  createTag: mockCreateTag,
  updateTag: mockUpdateTag,
  deleteTag: mockDeleteTag,
  getTagTransactions: mockGetTagTransactions,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from 'express';
import request from 'supertest';
import tagsRouter from '../../api/routes/tags';

const app = express();
app.use(express.json());
app.use('/api/tags', tagsRouter);

afterEach(() => jest.clearAllMocks());

describe('GET /api/tags', () => {
  test('returns tags list', async () => {
    mockGetTags.mockResolvedValueOnce([{ id: 't1', tag: 'groceries' }]);
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('passes pagination params', async () => {
    mockGetTags.mockResolvedValueOnce([]);
    await request(app).get('/api/tags?page=2&limit=10');
    expect(mockGetTags).toHaveBeenCalledWith(2, 10);
  });

  test('returns 500 on error', async () => {
    mockGetTags.mockRejectedValueOnce(new Error('fail'));
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/tags', () => {
  test('creates a tag', async () => {
    mockCreateTag.mockResolvedValueOnce({ id: 't2', tag: 'travel' });
    const res = await request(app)
      .post('/api/tags')
      .send({ tag: 'travel', description: 'Travel expenses' });
    expect(res.status).toBe(201);
    expect(res.body.data.tag).toBe('travel');
  });

  test('returns 400 when tag name missing', async () => {
    const res = await request(app).post('/api/tags').send({});
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/tags/:tag', () => {
  test('updates a tag', async () => {
    mockUpdateTag.mockResolvedValueOnce({ id: 't1', tag: 'updated' });
    const res = await request(app)
      .put('/api/tags/groceries')
      .send({ tag: 'updated' });
    expect(res.status).toBe(200);
    expect(mockUpdateTag).toHaveBeenCalledWith('groceries', expect.any(Object));
  });
});

describe('DELETE /api/tags/:tag', () => {
  test('deletes a tag', async () => {
    mockDeleteTag.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/tags/groceries');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/tags/:tag/transactions', () => {
  test('returns tag transactions', async () => {
    mockGetTagTransactions.mockResolvedValueOnce([{ id: 'tx1' }]);
    const res = await request(app).get('/api/tags/groceries/transactions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('passes pagination params', async () => {
    mockGetTagTransactions.mockResolvedValueOnce([]);
    await request(app).get('/api/tags/travel/transactions?page=3&limit=25');
    expect(mockGetTagTransactions).toHaveBeenCalledWith('travel', 3, 25);
  });
});
