import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
  userPlan: string;
}

interface JwtPayload {
  sub: string;
  email: string;
  plan: string;
  type?: string;
  iat?: number;
  exp?: number;
}

/** Extract userId from an authenticated request — use in route handlers */
export function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Read token from Authorization header or httpOnly cookie
  let token: string | undefined;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    // Reject refresh tokens used as access tokens
    if (payload.type && payload.type !== 'access') {
      res.status(401).json({ error: 'Invalid token type' });
      return;
    }
    (req as AuthenticatedRequest).userId = payload.sub;
    (req as AuthenticatedRequest).userEmail = payload.email;
    (req as AuthenticatedRequest).userPlan = payload.plan;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

export function requirePro(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const plan = (req as AuthenticatedRequest).userPlan;
  if (plan !== 'pro' && plan !== 'lifetime') {
    res.status(403).json({
      error: 'This feature requires a Pro or Lifetime subscription',
    });
    return;
  }
  next();
}
