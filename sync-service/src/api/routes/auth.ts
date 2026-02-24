import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, transaction } from '../../db/client';
import { config } from '../../config';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

// ─── Cookie helpers ─────────────────────────────────────────────────────────

function setTokenCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth',
  });
}

function clearTokenCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/auth' });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function signAccess(userId: string, email: string, plan: string): string {
  return jwt.sign({ sub: userId, email, plan, type: 'access' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body as {
    email?: string;
    password?: string;
    name?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'password must be at least 8 characters' });
    return;
  }

  try {
    const existing = await query(
      'SELECT id FROM app_users WHERE email = $1',
      [email.toLowerCase()]
    );
    if ((existing.rowCount ?? 0) > 0) {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO app_users (email, password_hash, name, plan)
       VALUES ($1, $2, $3, 'free')
       RETURNING id, email, name, plan`,
      [email.toLowerCase(), passwordHash, name ?? null]
    );
    const user = result.rows[0];

    const accessToken = signAccess(user.id, user.email, user.plan);
    const refreshToken = signRefresh(user.id);
    await storeRefreshToken(user.id, refreshToken);

    setTokenCookies(res, accessToken, refreshToken);
    res.status(201).json({ accessToken, refreshToken, user });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Register error');
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const result = await query(
      `SELECT id, email, name, plan, password_hash, subscription_status, force_password_change
       FROM app_users WHERE email = $1`,
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const accessToken = signAccess(user.id, user.email, user.plan);
    const refreshToken = signRefresh(user.id);
    await storeRefreshToken(user.id, refreshToken);

    const { password_hash: _, ...safeUser } = user;
    setTokenCookies(res, accessToken, refreshToken);
    res.json({ accessToken, refreshToken, user: safeUser });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Login error');
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response) => {
  // Read refresh token from cookie or body
  const refreshToken = req.cookies?.refreshToken || (req.body as { refreshToken?: string })?.refreshToken;
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, config.jwtRefreshSecret) as {
      sub: string;
    };
    const userId = payload.sub;

    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const tokenRow = await query(
      `SELECT id FROM refresh_tokens
       WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
      [userId, hash]
    );
    if ((tokenRow.rowCount ?? 0) === 0) {
      res.status(401).json({ error: 'Refresh token not found or expired' });
      return;
    }

    const userRow = await query(
      'SELECT id, email, plan FROM app_users WHERE id = $1',
      [userId]
    );
    const user = userRow.rows[0];
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const newAccessToken = signAccess(user.id, user.email, user.plan);
    const newRefreshToken = signRefresh(user.id);

    // Atomic token rotation: delete old + insert new in a single transaction
    await transaction(async (client) => {
      await client.query('DELETE FROM refresh_tokens WHERE id = $1', [tokenRow.rows[0].id]);
      const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await client.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, newHash, expiresAt]
      );
    });

    setTokenCookies(res, newAccessToken, newRefreshToken);
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  try {
    const result = await query(
      `SELECT id, email, name, plan, subscription_status, trial_ends_at, created_at
       FROM app_users WHERE id = $1`,
      [userId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /me error');
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─── PUT /api/auth/me ─── update profile ─────────────────────────────────────

router.put('/me', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { name, email } = req.body as { name?: string; email?: string };

  if (!name && !email) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name.trim()); }
    if (email !== undefined) {
      const e = email.trim().toLowerCase();
      // Check uniqueness
      const dup = await query('SELECT id FROM app_users WHERE email = $1 AND id != $2', [e, userId]);
      if (dup.rows.length > 0) {
        res.status(409).json({ error: 'Email already in use' });
        return;
      }
      sets.push(`email = $${idx++}`);
      vals.push(e);
    }

    vals.push(userId);
    const result = await query(
      `UPDATE app_users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, email, name, plan, subscription_status, trial_ends_at, created_at`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Update profile error');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─── PUT /api/auth/password ─── change password ──────────────────────────────

router.put('/password', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current and new password are required' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  try {
    const result = await query('SELECT password_hash FROM app_users WHERE id = $1', [userId]);
    if (!result.rows[0]) { res.status(404).json({ error: 'User not found' }); return; }

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) { res.status(401).json({ error: 'Current password is incorrect' }); return; }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE app_users SET password_hash = $1, force_password_change = false WHERE id = $2', [hash, userId]);

    // Revoke all refresh tokens for extra security
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    res.json({ ok: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Change password error');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  // Read refresh token from cookie or body
  const refreshToken = req.cookies?.refreshToken || (req.body as { refreshToken?: string })?.refreshToken;
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [
      hash,
    ]);
  }
  clearTokenCookies(res);
  res.json({ ok: true });
});

export default router;
