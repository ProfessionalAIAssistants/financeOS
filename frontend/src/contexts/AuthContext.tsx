import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: 'free' | 'pro' | 'lifetime';
  subscriptionStatus: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name?: string): Promise<void>;
  logout(): Promise<void>;
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const REFRESH_KEY = 'financeOS.refreshToken';
const ACCESS_KEY = 'financeOS.accessToken';

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

async function callAuth(
  path: string,
  body: object
): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
  const res = await fetch(`/api/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Authentication failed');
  return data as { accessToken: string; refreshToken: string; user: AuthUser };
}

async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Session expired');
  return res.json() as Promise<AuthUser>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    () => localStorage.getItem(ACCESS_KEY)
  );
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist access token and schedule silent refresh
  const storeTokens = useCallback(
    (at: string, rt: string, expiresInMs = 14 * 60 * 1000) => {
      localStorage.setItem(ACCESS_KEY, at);
      localStorage.setItem(REFRESH_KEY, rt);
      setAccessToken(at);

      // Schedule a silent refresh 1 minute before expiry
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(async () => {
        try {
          const stored = localStorage.getItem(REFRESH_KEY);
          if (!stored) return;
          const data = await callAuth('/refresh', { refreshToken: stored });
          storeTokens(data.accessToken, data.refreshToken);
        } catch {
          clearAuth();
        }
      }, expiresInMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function clearAuth() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setAccessToken(null);
    setUser(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }

  // On mount: try to restore session using stored access token or refresh token
  useEffect(() => {
    async function restore() {
      const at = localStorage.getItem(ACCESS_KEY);
      const rt = localStorage.getItem(REFRESH_KEY);

      if (at) {
        try {
          const me = await fetchMe(at);
          setUser(me);
          setAccessToken(at);
          setIsLoading(false);
          return;
        } catch {
          // access token expired — try refresh
        }
      }

      if (rt) {
        try {
          const data = await callAuth('/refresh', { refreshToken: rt });
          storeTokens(data.accessToken, data.refreshToken);
          setUser(data.user);
        } catch {
          clearAuth();
        }
      }

      setIsLoading(false);
    }

    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await callAuth('/login', { email, password });
      storeTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
    },
    [storeTokens]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const data = await callAuth('/register', { email, password, name });
      storeTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
    },
    [storeTokens]
  );

  const logout = useCallback(async () => {
    const rt = localStorage.getItem(REFRESH_KEY);
    try {
      if (rt) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
      }
    } finally {
      clearAuth();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
