/**
 * Tests for /api/auth routes.
 *
 * Mocks: db/client, bcryptjs, jsonwebtoken, config, logger
 */

const mockQuery = jest.fn();
const mockTransaction = jest.fn();
jest.mock('../../db/client', () => ({
  query: mockQuery,
  transaction: mockTransaction,
}));

const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
jest.mock('bcryptjs', () => ({
  hash: mockBcryptHash,
  compare: mockBcryptCompare,
}));

const mockJwtSign = jest.fn();
const mockJwtVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  sign: mockJwtSign,
  verify: mockJwtVerify,
}));

jest.mock('../../config', () => ({
  config: {
    jwtSecret: 'test-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtExpiresIn: '15m',
    jwtRefreshExpiresIn: '30d',
    isProd: false,
  },
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRouter from '../../api/routes/auth';

// Mount the router the same way as the real app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

afterEach(() => {
  jest.clearAllMocks();
});

// ── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('returns 400 when email missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('returns 400 when password missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email format/i);
  });

  test('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  test('returns 409 when email already exists', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'existing' }] });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'exists@test.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('creates user and returns tokens on success', async () => {
    // Check existing → none
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    // INSERT user
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'new@test.com', name: 'Test', plan: 'free' }],
    });
    // Store refresh token
    mockQuery.mockResolvedValueOnce({ rows: [] });

    mockBcryptHash.mockResolvedValue('hashed-pwd');
    mockJwtSign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@test.com', password: 'password123', name: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBe('access-token');
    expect(res.body.refreshToken).toBe('refresh-token');
    expect(res.body.user.email).toBe('new@test.com');
    // Verify cookies set
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
  });

  test('lowercases email on registration', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'user@test.com', name: null, plan: 'free' }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockBcryptHash.mockResolvedValue('hashed');
    mockJwtSign.mockReturnValue('tok');

    await request(app)
      .post('/api/auth/register')
      .send({ email: 'USER@TEST.COM', password: 'password123' });

    // First call to query checks existing user — with lowercased email
    expect(mockQuery.mock.calls[0][1]).toEqual(['user@test.com']);
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'password123' });
    expect(res.status).toBe(500);
  });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  test('returns 400 when email/password missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no@one.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid/i);
  });

  test('returns 401 when password does not match', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'a@b.com', password_hash: 'hash', plan: 'free' }],
    });
    mockBcryptCompare.mockResolvedValue(false);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrongpwd' });
    expect(res.status).toBe(401);
  });

  test('returns tokens and user on success', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'u1', email: 'a@b.com', name: 'User', plan: 'pro',
        password_hash: 'hash', subscription_status: 'active', force_password_change: false,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // store refresh token
    mockBcryptCompare.mockResolvedValue(true);
    mockJwtSign.mockReturnValueOnce('at').mockReturnValueOnce('rt');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('at');
    expect(res.body.user.email).toBe('a@b.com');
    // password_hash should not be in response
    expect(res.body.user.password_hash).toBeUndefined();
  });

  test('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'pass1234' });
    expect(res.status).toBe(500);
  });
});

// ── POST /api/auth/refresh ───────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  test('returns 400 when refreshToken missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 when jwt.verify fails', async () => {
    mockJwtVerify.mockImplementation(() => { throw new Error('bad token'); });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });
    expect(res.status).toBe(401);
  });

  test('returns 401 when token hash not found in DB', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1' });
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // token lookup
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-but-revoked' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not found or expired/i);
  });

  test('returns 401 when user not found', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u99' });
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tkn-1' }] }); // token found
    mockQuery.mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/User not found/i);
  });

  test('rotates tokens on success', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1' });
    // Token lookup
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'tkn-1' }] });
    // User lookup
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'a@b.com', plan: 'pro' }] });
    // Transaction for token rotation
    mockTransaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      await fn({ query: jest.fn() });
    });
    mockJwtSign.mockReturnValueOnce('new-at').mockReturnValueOnce('new-rt');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('new-at');
    expect(res.body.refreshToken).toBe('new-rt');
  });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  // Note: this route uses requireAuth middleware, which we partially mock via jwt
  test('returns user profile when authenticated', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'a@b.com', name: 'Test', plan: 'free' }],
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('u1');
  });

  test('returns 404 when user not found in DB', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u99', email: 'a@b.com', plan: 'free' });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(404);
  });
});

// ── PUT /api/auth/password ───────────────────────────────────────────────────

describe('PUT /api/auth/password', () => {
  test('returns 400 when fields missing', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', 'Bearer tok')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 400 when new password too short', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', 'Bearer tok')
      .send({ currentPassword: 'old12345', newPassword: 'short' });
    expect(res.status).toBe(400);
  });

  test('returns 401 when current password incorrect', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    mockQuery.mockResolvedValueOnce({ rows: [{ password_hash: 'hash' }] });
    mockBcryptCompare.mockResolvedValue(false);
    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', 'Bearer tok')
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  test('changes password and revokes refresh tokens', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    mockQuery.mockResolvedValueOnce({ rows: [{ password_hash: 'oldhash' }] }); // fetch hash
    mockBcryptCompare.mockResolvedValue(true);
    mockBcryptHash.mockResolvedValue('newhash');
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update password
    mockQuery.mockResolvedValueOnce({ rows: [] }); // delete refresh tokens

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', 'Bearer tok')
      .send({ currentPassword: 'old12345', newPassword: 'newpass123' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  test('clears cookies and returns ok', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer tok');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── PUT /api/auth/me (update profile) ────────────────────────────────────────

describe('PUT /api/auth/me', () => {
  test('returns 400 when nothing to update', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', 'Bearer tok')
      .send({});
    expect(res.status).toBe(400);
  });

  test('updates name successfully', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'a@b.com', name: 'New Name', plan: 'free' }],
    });
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', 'Bearer tok')
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  test('returns 409 when email already taken', async () => {
    mockJwtVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    // Duplicate check
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'other-user' }] });
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', 'Bearer tok')
      .send({ email: 'taken@test.com' });
    expect(res.status).toBe(409);
  });
});
