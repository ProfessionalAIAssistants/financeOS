import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useQuery } from '../hooks/useQuery';
import { networthApi, insightsApi, subsApi } from '../lib/api';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate, CHART_COLORS } from '../lib/utils';
import { motion } from 'framer-motion';

export function Dashboard() {
  const { data: current, isLoading } = useQuery(['nw-current'], networthApi.current);
  const { data: history = [] } = useQuery(['nw-history-90'], () => networthApi.history(90));
  const { data: insight } = useQuery(['insight-latest'], insightsApi.latest);
  const { data: subsSummary } = useQuery(['subs-summary'], subsApi.summary);

  if (isLoading) return <PageSpinner />;

  const netWorth = parseFloat(current?.net_worth ?? '0');
  const assets = parseFloat(current?.total_assets ?? '0');
  const liabilities = parseFloat(current?.total_liabilities ?? '0');

  const chartData = history.map((h: { snapshot_date: string; net_worth: string | number }) => ({
    date: fmtDate(h.snapshot_date, 'MMM d'),
    value: parseFloat(String(h.net_worth)),
  }));

  const byCat = (subsSummary?.byCategory ?? []).slice(0, 6);
  const colors = CHART_COLORS();

  return (
    <div className="space-y-6 pb-20 md:pb-0">
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

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Assets"       value={assets}      icon={<TrendingUp className="w-4 h-4"/>}     glow="green"  delay={0} />
        <StatCard title="Total Liabilities"  value={liabilities} icon={<TrendingDown className="w-4 h-4"/>}   glow="red"    delay={0.05} />
        <StatCard title="Monthly Income"     value={parseFloat(current?.breakdown?.monthlyIncome ?? '0')}    icon={<Wallet className="w-4 h-4"/>}       glow="blue"   delay={0.1} />
        <StatCard title="Monthly Expenses"   value={parseFloat(current?.breakdown?.monthlyExpenses ?? '0')}  icon={<PiggyBank className="w-4 h-4"/>}    glow="purple" delay={0.15} />
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
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
              <Tooltip formatter={(v: unknown) => [fmt(Number(v)), "Net Worth"]} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#nwGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

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
            <a href="/subscriptions" className="text-xs text-blue-400 hover:text-blue-300">View all →</a>
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
