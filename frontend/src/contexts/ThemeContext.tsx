import { createContext, useContext, useEffect, useState, useCallback } from 'react';

type ThemeSetting = 'dark' | 'light' | 'system';
type ResolvedTheme = 'dark' | 'light';

interface ThemeContextValue {
  theme: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemeSetting) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  resolvedTheme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: true,
});

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function resolve(setting: ThemeSetting): ResolvedTheme {
  return setting === 'system' ? getSystemTheme() : setting;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(themeSetting));

  // Apply to DOM
  useEffect(() => {
    const r = resolve(themeSetting);
    setResolved(r);
    const root = document.documentElement;
    if (r === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    try { localStorage.setItem('theme', themeSetting); } catch {}
  }, [themeSetting]);

  // Listen for OS theme changes when set to 'system'
  useEffect(() => {
    if (themeSetting !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const r = getSystemTheme();
      setResolved(r);
      const root = document.documentElement;
      if (r === 'light') root.setAttribute('data-theme', 'light');
      else root.removeAttribute('data-theme');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeSetting]);

  const setTheme = useCallback((t: ThemeSetting) => setThemeSetting(t), []);
  const toggleTheme = useCallback(() => {
    setThemeSetting(prev => {
      const current = resolve(prev);
      return current === 'dark' ? 'light' : 'dark';
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: themeSetting, resolvedTheme: resolved, setTheme, toggleTheme, isDark: resolved === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
