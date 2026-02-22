import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider }  from './contexts/ThemeContext';
import { ToastProvider }  from './components/ui/Toast';
import { Layout }        from './components/layout/Layout';
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

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 60_000 },
  },
});

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <ToastProvider>
        <BrowserRouter>
          <Routes>
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
              <Route path="settings"      element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
