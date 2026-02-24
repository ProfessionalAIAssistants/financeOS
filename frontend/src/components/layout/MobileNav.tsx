import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, TrendingUp, CreditCard, PiggyBank, Bell, MoreHorizontal,
  BarChart3, Home, Repeat, Shield, Activity, FileText, Upload, Link2, Settings, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const primaryItems = [
  { path: '/',             label: 'Home',    icon: LayoutDashboard },
  { path: '/networth',     label: 'Worth',   icon: TrendingUp },
  { path: '/transactions', label: 'Txns',    icon: CreditCard },
  { path: '/budgets',      label: 'Budgets', icon: PiggyBank },
  { path: '/alerts',       label: 'Alerts',  icon: Bell },
];

const moreItems = [
  { path: '/investments',   label: 'Investments',   icon: BarChart3 },
  { path: '/assets',        label: 'Assets',        icon: Home },
  { path: '/subscriptions', label: 'Subscriptions', icon: Repeat },
  { path: '/insurance',     label: 'Insurance',     icon: Shield },
  { path: '/forecasting',   label: 'Forecasting',   icon: Activity },
  { path: '/insights',      label: 'AI Insights',   icon: FileText },
  { path: '/upload',        label: 'Import Data',   icon: Upload },
  { path: '/linked-banks',  label: 'Link Banks',    icon: Link2 },
  { path: '/settings',      label: 'Settings',      icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isMoreActive = moreItems.some(i => location.pathname.startsWith(i.path) && i.path !== '/');

  return (
    <>
      {/* Bottom bar */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 safe-bottom backdrop-blur-xl"
        style={{
          background: 'var(--bg-topbar)',
          borderTop: '1px solid var(--border)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        }}
      >
        <div className="flex">
          {primaryItems.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} className="flex-1">
              {({ isActive }) => (
                <div
                  className={cn('flex flex-col items-center py-2.5 gap-0.5 transition-colors')}
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </div>
              )}
            </NavLink>
          ))}
          {/* More button */}
          <button onClick={() => setOpen(true)} className="flex-1">
            <div
              className="flex flex-col items-center py-2.5 gap-0.5 transition-colors"
              style={{ color: isMoreActive ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </div>
          </button>
        </div>
      </nav>

      {/* More drawer */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: 'var(--bg-overlay)' }}
              onClick={() => setOpen(false)}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl safe-bottom overflow-hidden"
              style={{
                background: 'var(--bg-elevated)',
                borderTop: '1px solid var(--border)',
                boxShadow: 'var(--shadow-xl)',
                maxHeight: '70vh',
              }}
            >
              {/* Handle + header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>More</span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="w-10 h-1 rounded-full mx-auto mb-3" style={{ background: 'var(--border-strong)' }} />

              {/* Grid of items */}
              <div className="grid grid-cols-3 gap-1 px-3 pb-6">
                {moreItems.map(({ path, label, icon: Icon }) => {
                  const active = location.pathname.startsWith(path) && path !== '/';
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      onClick={() => setOpen(false)}
                      className="flex flex-col items-center gap-1.5 py-4 rounded-xl transition-colors"
                      style={active ? {
                        background: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                      } : {
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
