import { NavLink, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, TrendingUp, CreditCard, Landmark, Home, FileText,
  Shield, Bell, Upload, Settings, BarChart3, Repeat, ChevronLeft, ChevronRight,
  Activity, PiggyBank, LogOut, Link2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { path: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { path: '/networth',     label: 'Net Worth',    icon: TrendingUp },
  { path: '/accounts',     label: 'Accounts',     icon: Landmark },
  { path: '/transactions', label: 'Transactions', icon: CreditCard },
  { path: '/budgets',      label: 'Budgets',      icon: PiggyBank },
  { path: '/investments',  label: 'Investments',  icon: BarChart3 },
  { path: '/assets',       label: 'Assets',       icon: Home },
  { path: '/subscriptions',label: 'Subscriptions',icon: Repeat },
  { path: '/insurance',    label: 'Insurance',    icon: Shield },
  { path: '/forecasting',  label: 'Forecasting',  icon: Activity },
  { path: '/insights',     label: 'Insights',     icon: FileText },
  { path: '/alerts',       label: 'Alerts',       icon: Bell },
  { path: '/upload',       label: 'Import',       icon: Upload },
  { path: '/linked-banks', label: 'Link Banks',   icon: Link2 },
  { path: '/settings',     label: 'Settings',     icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const planColors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    pro: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    lifetime: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  };
  const plan = user?.plan ?? 'free';

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-sidebar)',
      }}
      className="relative h-full min-h-0 flex flex-col backdrop-blur-xl shrink-0 overflow-hidden"
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5 shrink-0"
        style={{ borderBottom: '1px solid var(--border-sidebar)' }}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{ background: 'var(--gradient-primary)' }}>
          F
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              className="font-bold text-sm whitespace-nowrap"
              style={{ color: 'var(--sidebar-text)' }}
            >
              FinanceOS
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-2 space-y-px scrollbar-sidebar">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <NavLink key={path} to={path} title={collapsed ? label : undefined}>
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-150',
                )}
                style={active ? {
                  background: 'var(--sidebar-active-bg)',
                  color: 'var(--sidebar-text)',
                  border: '1px solid var(--sidebar-active-border)',
                } : {
                  color: 'var(--sidebar-text-muted)',
                  border: '1px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--sidebar-hover-bg)';
                    (e.currentTarget as HTMLDivElement).style.color = 'var(--sidebar-text)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = '';
                    (e.currentTarget as HTMLDivElement).style.color = 'var(--sidebar-text-muted)';
                  }
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </NavLink>
          );
        })}
      </nav>

      {/* User footer */}
      <div
        className="shrink-0 px-2 py-3"
        style={{ borderTop: '1px solid var(--border-sidebar)' }}
      >
        <div className="flex items-center gap-2 px-2">
          {/* Avatar */}
          <Link to="/settings" className="flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold uppercase">
              {user?.name?.[0] ?? user?.email?.[0] ?? '?'}
            </div>
          </Link>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 min-w-0 flex items-center gap-1.5"
              >
                <span
                  className="text-xs font-medium truncate"
                  style={{ color: 'var(--sidebar-text)' }}
                  title={user?.email}
                >
                  {user?.name ?? user?.email}
                </span>
                <Link to="/billing">
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize flex-shrink-0', planColors[plan])}>
                    {plan}
                  </span>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!collapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => void logout()}
                title="Sign out"
                className="flex-shrink-0 p-1 rounded-lg transition-colors"
                style={{ color: 'var(--sidebar-text-muted)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sidebar-text-muted)'; }}
              >
                <LogOut className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-colors z-10"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-muted)',
          boxShadow: 'var(--shadow-sm)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
        }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.aside>
  );
}
