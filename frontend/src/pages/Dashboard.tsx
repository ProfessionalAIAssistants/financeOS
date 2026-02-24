import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ShieldCheck, Percent, Upload as UploadIcon, Link2, ArrowRight } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import { useQuery } from '../hooks/useQuery';
import { networthApi, insightsApi, subsApi } from '../lib/api';

function thisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}
import { StatCard } from '../components/ui/StatCard';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate, CHART_COLORS } from '../lib/utils';
import { motion } from 'framer-motion';

export function Dashboard() {
  const { start, end } = thisMonthRange();

  // Net worth polls every 2 min — it changes on account sync
  const { data: current, isLoading } = useQuery(['nw-current'], networthApi.current, { refetchInterval: 120_000 });
  const { data: history = [] }       = useQuery(['nw-history-90'], () => networthApi.history(90), { refetchInterval: 120_000 });
  // Static-ish data — no auto-poll needed
  const { data: insight }      = useQuery(['insight-latest'], insightsApi.latest);
  const { data: subsSummary }  = useQuery(['subs-summary'], subsApi.summary);
  const { data: catSpending }  = useQuery(['cat-spending', start, end], () => insightsApi.categories(start, end));
  const { data: emergencyFund }= useQuery(['emergency-fund'], insightsApi.emergencyFund);

  if (isLoading) return <PageSpinner />;

  const netWorth    = parseFloat(current?.net_worth ?? '0');
  const assets      = parseFloat(current?.total_assets ?? '0');
  const liabilities = parseFloat(current?.total_liabilities ?? '0');

  const isEmpty = netWorth === 0 && assets === 0 && liabilities === 0 && history.length === 0;

  const monthlyIncome   = parseFloat(current?.breakdown?.monthlyIncome   ?? '0');
  const monthlyExpenses = parseFloat(current?.breakdown?.monthlyExpenses ?? '0');
  const savingsRate     = monthlyIncome > 0
    ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
    : null;

  const efMonths    = emergencyFund?.monthsCovered ?? null;
  const efPct       = emergencyFund?.pctOfTarget ?? null;

  const chartData = history.map((h: { snapshot_date: string; net_worth: string | number }) => ({
    date: fmtDate(h.snapshot_date, 'MMM d'),
    value: parseFloat(String(h.net_worth)),
  }));

  const byCat  = (subsSummary?.byCategory ?? []).slice(0, 6);
  const colors = CHART_COLORS();

  // Category spending bar chart data
  const spendingByCategory: Array<{ category: string; amount: number }> =
    (catSpending?.byCategory ?? [])
      .slice(0, 8)
      .map((c: { category: string; total: number }) => ({
        category: c.category || 'Uncategorized',
        amount: c.total,
      }));

  return (
    <div className="space-y-6 pb-20 md:pb-0">

      {/* Onboarding — shown when no data exists */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 md:p-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-30 pointer-events-none"
            style={{ background: 'var(--gradient-primary)' }} />
          <div className="relative">
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Welcome to FinanceOS 👋
            </h2>
            <p className="text-sm mb-6 max-w-lg" style={{ color: 'var(--text-secondary)' }}>
              Get started by connecting your bank accounts or importing transaction data.
              Once you have data flowing, this dashboard will show your net worth, spending trends, AI insights, and more.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/linked-banks">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow)' }}
                >
                  <Link2 className="w-4 h-4" /> Link Bank Account <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Link>
              <Link to="/upload">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-strong)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <UploadIcon className="w-4 h-4" /> Import CSV / OFX
                </button>
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero gradient */}
      <div className="relative overflow-hidden glass p-6 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-violet-600/10 to-transparent pointer-events-none" />
        <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Total Net Worth</p>
        <motion.h2
          key={netWorth}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-extrabold gradient-text mb-4"
        >
          {fmt(netWorth)}
        </motion.h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Assets {fmt(assets)} · Liabilities {fmt(liabilities)}
          {current?.snapshot_date && ` · as of ${fmtDate(current.snapshot_date)}`}
        </p>
      </div>

      {/* Plain-language verdict strip */}
      {(savingsRate !== null || efMonths !== null) && (() => {
        const parts: string[] = [];
        if (savingsRate !== null) {
          const monthlySaved = monthlyIncome - monthlyExpenses;
          if (savingsRate >= 20) {
            parts.push(`Saving ${savingsRate}% of income (${fmt(monthlySaved)}/mo) — excellent pace.`);
          } else if (savingsRate >= 10) {
            parts.push(`Saving ${savingsRate}% of income (${fmt(monthlySaved)}/mo). Aim for 20%+ to build wealth faster.`);
          } else if (savingsRate > 0) {
            parts.push(`Saving ${savingsRate}% of income this month. Cutting expenses would accelerate progress.`);
          } else {
            parts.push(`Spending is outpacing income right now — focus on reducing expenses or boosting income.`);
          }
        }
        if (efMonths !== null) {
          if (efMonths >= 6) {
            parts.push(`Emergency fund covers ${efMonths} months — well protected.`);
          } else if (efMonths >= 3) {
            parts.push(`Emergency fund covers ${efMonths} months; build toward 6 months next.`);
          } else {
            parts.push(`Emergency fund only covers ${efMonths} month${efMonths === 1 ? '' : 's'} — prioritize building this safety net.`);
          }
        }
        if (parts.length === 0) return null;
        return (
          <div className="glass px-5 py-3 flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent)' }}>
            <span>{parts.join(' ')}</span>
            <Link to="/forecasting" className="ml-auto shrink-0 text-xs" style={{ color: 'var(--accent)' }}>
              See retirement timeline →
            </Link>
          </div>
        );
      })()}

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Assets"      value={assets}       icon={<TrendingUp className="w-4 h-4"/>}   glow="green"  delay={0} />
        <StatCard title="Total Liabilities" value={liabilities}  icon={<TrendingDown className="w-4 h-4"/>} glow="red"    delay={0.05} />
        <StatCard title="Monthly Income"    value={monthlyIncome}  icon={<Wallet className="w-4 h-4"/>}     glow="blue"   delay={0.1} />
        <StatCard title="Monthly Expenses"  value={monthlyExpenses} icon={<PiggyBank className="w-4 h-4"/>} glow="purple" delay={0.15} />

        {/* Savings Rate */}
        <div
          className="glass p-5"
          title="Savings rate = (income − expenses) / income. Target: 20%+ for strong wealth building."
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Savings Rate
              </p>
              <p className={`text-2xl font-bold ${savingsRate == null ? '' : savingsRate >= 20 ? 'text-emerald-400' : savingsRate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                {savingsRate != null ? `${savingsRate}%` : '—'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>target: 20%+</p>
            </div>
            <div className="ml-3 p-2.5 rounded-xl shrink-0" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
              <Percent className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Emergency Fund */}
        <div
          className="glass p-5"
          title="Emergency fund = liquid assets ÷ monthly expenses. Target: 6 months of coverage."
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>
                Emergency Fund
              </p>
              <p className={`text-2xl font-bold ${efMonths == null ? '' : efMonths >= 6 ? 'text-emerald-400' : efMonths >= 3 ? 'text-yellow-400' : 'text-red-400'}`}>
                {efMonths != null ? `${efMonths}mo` : '—'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {efPct != null ? `${Math.min(efPct, 100)}% of 6mo target` : 'target: 6 months'}
              </p>
            </div>
            <div className="ml-3 p-2.5 rounded-xl shrink-0" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Net Worth chart */}
      <Card>
        <CardHeader>
          <CardTitle>Net Worth — 90 Days</CardTitle>
        </CardHeader>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
              <Tooltip formatter={(v: unknown) => [fmt(Number(v)), 'Net Worth']} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#nwGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Category spending chart */}
      {spendingByCategory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category — This Month</CardTitle>
            <Link to="/transactions" className="text-xs text-blue-400 hover:text-blue-300">View transactions →</Link>
          </CardHeader>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendingByCategory} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(1)}k`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="category"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + '…' : v}
                />
                <Tooltip
                  formatter={(v: unknown) => [fmt(Number(v)), 'Spent']}
                  contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {spendingByCategory.map((_: unknown, i: number) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Insight */}
        <Card glow="purple">
          <CardHeader><CardTitle>AI Monthly Insight</CardTitle></CardHeader>
          {insight ? (
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{fmtDate(insight.sent_at, 'MMMM yyyy')}</p>
              <p className="text-sm leading-relaxed line-clamp-6" style={{ color: 'var(--text-secondary)' }}>
                {typeof insight.metadata === 'string' ? JSON.parse(insight.metadata)?.narrative : insight.metadata?.narrative ?? insight.message}
              </p>
            </div>
          ) : (
            <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>No insights yet. Run a sync to generate your first AI insight.</p>
          )}
        </Card>

        {/* Top subscriptions */}
        <Card>
          <CardHeader>
            <CardTitle>Subscription Spend</CardTitle>
            <Link to="/subscriptions" className="text-xs text-blue-400 hover:text-blue-300">View all →</Link>
          </CardHeader>
          {byCat.length > 0 ? (
            <div className="flex items-center gap-4">
              <PieChart width={120} height={120}>
                <Pie data={byCat} cx={55} cy={55} innerRadius={30} outerRadius={55}
                  dataKey="monthly_total" paddingAngle={2}>
                  {byCat.map((_: unknown, i: number) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-2">
                {byCat.map((c: { category: string; monthly_total: number }, i: number) => (
                  <div key={c.category} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
                      <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{c.category || 'Other'}</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{fmt(c.monthly_total)}/mo</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>No subscriptions detected yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
