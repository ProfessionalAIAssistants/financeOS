import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, CreditCard, PiggyBank, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';

const mobileItems = [
  { path: '/',             label: 'Home',    icon: LayoutDashboard },
  { path: '/networth',     label: 'Worth',   icon: TrendingUp },
  { path: '/transactions', label: 'Txns',    icon: CreditCard },
  { path: '/budgets',      label: 'Budgets', icon: PiggyBank },
  { path: '/alerts',       label: 'Alerts',  icon: Bell },
];

export function MobileNav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 safe-bottom backdrop-blur-xl"
      style={{
        background: 'var(--bg-topbar)',
        borderTop: '1px solid var(--border)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
      }}
    >
      <div className="flex">
        {mobileItems.map(({ path, label, icon: Icon }) => (
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
      </div>
    </nav>
  );
}
