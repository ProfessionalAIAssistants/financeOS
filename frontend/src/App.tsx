import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider }  from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider }  from './components/ui/Toast';
import { ErrorBoundary }  from './components/ErrorBoundary';
import { Layout }        from './components/layout/Layout';
import { PageSpinner }   from './components/ui/Spinner';
import { Dashboard }     from './pages/Dashboard';
import { NetWorth }      from './pages/NetWorth';
import { Accounts }      from './pages/Accounts';
import { Transactions }  from './pages/Transactions';
import { Investments }   from './pages/Investments';
import { Assets }        from './pages/Assets';
import { Budgets }       from './pages/Budgets';
import { Subscriptions } from './pages/Subscriptions';
import { Insurance }     from './pages/Insurance';
import { Forecasting }   from './pages/Forecasting';
import { Insights }      from './pages/Insights';
import { Alerts }        from './pages/Alerts';
import { Upload }        from './pages/Upload';
import { Settings }      from './pages/Settings';
import { Billing }       from './pages/Billing';
import { LinkedAccounts } from './pages/LinkedAccounts';
import { Login }         from './pages/Login';
import { NotFound }      from './pages/NotFound';

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 60_000 },
  },
});

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />

                {/* Protected — wrapped in Layout */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route index                 element={<Dashboard />} />
                    <Route path="networth"      element={<NetWorth />} />
                    <Route path="accounts"      element={<Accounts />} />
                    <Route path="transactions"  element={<Transactions />} />
                    <Route path="budgets"       element={<Budgets />} />
                    <Route path="investments"   element={<Investments />} />
                    <Route path="assets"        element={<Assets />} />
                    <Route path="subscriptions" element={<Subscriptions />} />
                    <Route path="insurance"     element={<Insurance />} />
                    <Route path="forecasting"   element={<Forecasting />} />
                    <Route path="insights"      element={<Insights />} />
                    <Route path="alerts"        element={<Alerts />} />
                    <Route path="upload"        element={<Upload />} />
                    <Route path="linked-banks"  element={<LinkedAccounts />} />
                    <Route path="settings"      element={<Settings />} />
                    <Route path="billing"       element={<Billing />} />
                    <Route path="*"             element={<NotFound />} />
                  </Route>
                </Route>
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

