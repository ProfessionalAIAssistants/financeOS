import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, TrendingUp, CreditCard, Landmark, Home, FileText,
  Shield, Bell, Upload, Settings, BarChart3, Repeat, ChevronLeft, ChevronRight,
  Activity, PiggyBank,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';

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
  { path: '/settings',     label: 'Settings',     icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 220 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      style={{
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-sidebar)',
      }}
      className="relative h-full flex flex-col backdrop-blur-xl shrink-0 overflow-hidden"
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
              style={{ color: 'var(--text-primary)' }}
            >
              FinanceOS
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <NavLink key={path} to={path} title={collapsed ? label : undefined}>
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150',
                )}
                style={active ? {
                  background: 'var(--bg-active-nav)',
                  color: 'var(--accent)',
                  border: '1px solid var(--border-active)',
                } : {
                  color: 'var(--text-muted)',
                  border: '1px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover-nav)';
                    (e.currentTarget as HTMLDivElement).style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLDivElement).style.background = '';
                    (e.currentTarget as HTMLDivElement).style.color = 'var(--text-muted)';
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
