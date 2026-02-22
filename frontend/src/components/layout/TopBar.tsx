import { Bell, RefreshCw, Sun, Moon } from 'lucide-react';
import { useQuery } from '../../hooks/useQuery';
import { alertsApi, syncApi } from '../../lib/api';
import { cn, fmtRelative } from '../../lib/utils';
import { useMutation, useQueryClient } from '../../hooks/useQuery';
import { useTheme } from '../../contexts/ThemeContext';

export function TopBar({ title }: { title: string }) {
  const qc = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  const { data: unread = 0 } = useQuery(['alerts-unread'], alertsApi.unreadCount, { refetchInterval: 30_000 });
  const { data: syncStatus } = useQuery(['sync-status'], syncApi.status, { staleTime: 30_000 });

  const syncMutation = useMutation({
    mutationFn: () => syncApi.force(),
    onSuccess: () => {
      setTimeout(() => qc.invalidateQueries(), 5000);
    },
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
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
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
          {theme === 'dark'
            ? <Sun className="w-4 h-4" />
            : <Moon className="w-4 h-4" />}
        </button>

        {/* Alerts bell */}
        <a
          href="/alerts"
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
        </a>
      </div>
    </header>
  );
}
