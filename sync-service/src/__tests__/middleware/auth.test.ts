/**
 * Tests for requireAuth, requirePro, getUserId middleware.
 *
 * Mocks:
 *  - jsonwebtoken – prevents real JWT verification
 *  - config – provides test secrets
 */

const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  verify: mockVerify,
}));

jest.mock('../../config', () => ({
  config: { jwtSecret: 'test-secret' },
}));

import express, { Request, Response } from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import {
  requireAuth,
  requirePro,
  getUserId,
  AuthenticatedRequest,
} from '../../middleware/auth';

// ── Setup test app ────────────────────────────────────────────────────────────

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get('/protected', requireAuth, (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    res.json({
      userId: authReq.userId,
      userEmail: authReq.userEmail,
      userPlan: authReq.userPlan,
    });
  });

  app.get('/pro-only', requireAuth, requirePro, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get('/user-id', requireAuth, (req: Request, res: Response) => {
    res.json({ userId: getUserId(req) });
  });

  return app;
}

afterEach(() => {
  mockVerify.mockReset();
});

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  const app = createApp();

  test('returns 401 when no Authorization header or cookie', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Missing/i);
  });

  test('accepts Bearer token from Authorization header', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('u1');
    expect(res.body.userEmail).toBe('a@b.com');
    expect(res.body.userPlan).toBe('free');
    expect(mockVerify).toHaveBeenCalledWith('valid-token', 'test-secret');
  });

  test('accepts token from accessToken cookie', async () => {
    mockVerify.mockReturnValue({ sub: 'u2', email: 'x@y.com', plan: 'pro' });
    const res = await request(app)
      .get('/protected')
      .set('Cookie', 'accessToken=cookie-token');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('u2');
    expect(mockVerify).toHaveBeenCalledWith('cookie-token', 'test-secret');
  });

  test('returns 401 when jwt.verify throws', async () => {
    mockVerify.mockImplementation(() => { throw new Error('jwt expired'); });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer expired-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  test('rejects refresh token used as access token', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free', type: 'refresh' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer refresh-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid token type/i);
  });

  test('allows access token with explicit type "access"', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free', type: 'access' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer access-token');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('u1');
  });

  test('ignores Authorization header that does not start with Bearer', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  test('prefers Authorization header over cookie', async () => {
    mockVerify.mockReturnValue({ sub: 'from-header', email: 'h@h.com', plan: 'free' });
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer header-token')
      .set('Cookie', 'accessToken=cookie-token');
    expect(res.status).toBe(200);
    expect(mockVerify).toHaveBeenCalledWith('header-token', 'test-secret');
  });
});

// ── requirePro ────────────────────────────────────────────────────────────────

describe('requirePro', () => {
  const app = createApp();

  test('allows "pro" plan', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'pro' });
    const res = await request(app)
      .get('/pro-only')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  test('allows "lifetime" plan', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'lifetime' });
    const res = await request(app)
      .get('/pro-only')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
  });

  test('rejects "free" plan with 403', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: 'free' });
    const res = await request(app)
      .get('/pro-only')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Pro or Lifetime/i);
  });

  test('rejects undefined plan with 403', async () => {
    mockVerify.mockReturnValue({ sub: 'u1', email: 'a@b.com', plan: undefined });
    const res = await request(app)
      .get('/pro-only')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(403);
  });
});

// ── getUserId ─────────────────────────────────────────────────────────────────

describe('getUserId', () => {
  const app = createApp();

  test('extracts userId set by requireAuth', async () => {
    mockVerify.mockReturnValue({ sub: 'user-42', email: 'a@b.com', plan: 'free' });
    const res = await request(app)
      .get('/user-id')
      .set('Authorization', 'Bearer t');
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('user-42');
  });
});
