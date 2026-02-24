import { Bell, RefreshCw, Sun, Moon, LogOut, CreditCard as CreditCardIcon, Settings as SettingsIcon, ChevronDown } from 'lucide-react';
import { useQuery } from '../../hooks/useQuery';
import { alertsApi, syncApi } from '../../lib/api';
import { cn, fmtRelative } from '../../lib/utils';
import { useMutation, useQueryClient } from '../../hooks/useQuery';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../ui/Toast';

export function TopBar({ title }: { title: string }) {
  const qc = useQueryClient();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const toast = useToast();
  const { data: unread = 0 } = useQuery(['alerts-unread'], alertsApi.unreadCount, { refetchInterval: 30_000 });
  const { data: syncStatus } = useQuery(['sync-status'], syncApi.status, { staleTime: 30_000 });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const syncMutation = useMutation({
    mutationFn: () => syncApi.force(),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries(), 5000);
    },
    onError: () => toast.error('Sync failed'),
  });

  const fireflyOk = syncStatus?.firefly?.healthy !== false;

  return (
    <header
      className="h-14 flex items-center justify-between px-6 shrink-0 backdrop-blur-xl"
      style={{
        background: 'var(--bg-topbar)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h1>

      <div className="flex items-center gap-2">
        {/* System status */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className={cn('status-dot', fireflyOk ? 'green' : 'red')} />
          <span>{fireflyOk ? 'Live' : 'Offline'}</span>
        </div>

        {/* Last sync */}
        {syncStatus?.institutions?.[0]?.lastSync && (
          <span className="hidden lg:block text-xs" style={{ color: 'var(--text-disabled)' }}>
            {fmtRelative(syncStatus.institutions[0].lastSync)}
          </span>
        )}

        {/* Force sync */}
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          title="Force sync all accounts"
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}
        >
          <RefreshCw className={cn('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="p-2 rounded-lg transition-all duration-200"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}
        >
          {resolvedTheme === 'dark'
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />}
        </button>

        {/* Alerts bell */}
        <Link
          to="/alerts"
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-input)';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLAnchorElement).style.background = '';
            (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)';
          }}
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>

        {/* User avatar + dropdown */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-input)'; }}
            onMouseLeave={e => { if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = ''; }}
          >
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold uppercase">
              {user?.name?.[0] ?? user?.email?.[0] ?? '?'}
            </div>
            <ChevronDown className="w-3 h-3 hidden sm:block" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-lg border overflow-hidden z-50"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {/* User info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {user?.name ?? 'Account'}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {user?.email}
                </p>
                <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold rounded-full capitalize bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {user?.plan ?? 'free'}
                </span>
              </div>

              {/* Links */}
              <div className="py-1">
                {[
                  { to: '/settings', label: 'Settings', icon: SettingsIcon },
                  { to: '/billing', label: 'Billing', icon: CreditCardIcon },
                ].map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover-nav)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = ''; }}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                ))}
              </div>

              <div className="border-t py-1" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => { setMenuOpen(false); void logout(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
