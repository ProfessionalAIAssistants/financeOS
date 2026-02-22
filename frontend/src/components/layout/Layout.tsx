import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';

const pageTitles: Record<string, string> = {
  '/':              'Dashboard',
  '/networth':      'Net Worth',
  '/accounts':      'Accounts',
  '/transactions':  'Transactions',
  '/budgets':       'Budgets',
  '/investments':   'Investments',
  '/assets':        'Assets & Property',
  '/subscriptions': 'Subscriptions',
  '/insurance':     'Insurance',
  '/forecasting':   'Forecasting',
  '/insights':      'AI Insights',
  '/alerts':        'Alerts',
  '/upload':        'Import Data',
  '/settings':      'Settings',
};

export function Layout() {
  const location = useLocation();
  const basePath = '/' + location.pathname.split('/')[1];
  const title = pageTitles[basePath] ?? 'FinanceOS';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={title} />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{ background: 'var(--bg-base)' }}
        >
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden">
        <MobileNav />
      </div>
    </div>
  );
}
