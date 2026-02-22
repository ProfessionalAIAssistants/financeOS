import { Link } from 'react-router-dom';
import { useQuery } from '../hooks/useQuery';
import { networthApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt } from '../lib/utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from '../lib/utils';
import { TrendingUp, BarChart2, Info } from 'lucide-react';

export function Investments() {
  const { data: breakdown, isLoading } = useQuery(['nw-breakdown'], networthApi.breakdown);

  if (isLoading) return <PageSpinner />;

  const investmentKeys = ['m1finance', 'fidelity', 'investment'];
  const investData = breakdown
    ? Object.entries(breakdown as Record<string, string | number>)
        .filter(([k]) => investmentKeys.some(ik => k.toLowerCase().includes(ik)))
        .map(([k, v]) => ({ name: k, value: parseFloat(String(v)) }))
        .filter(d => d.value > 0)
    : [];

  const totalInvested = investData.reduce((s, d) => s + d.value, 0);
  const colors = CHART_COLORS();

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Total */}
      <div className="glass p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-transparent to-transparent pointer-events-none" />
        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-secondary)' }}>Total Invested</p>
        <p className="text-3xl font-bold gradient-text">{fmt(totalInvested)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation pie */}
        <Card>
          <CardHeader><CardTitle>Portfolio Allocation</CardTitle></CardHeader>
          {investData.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={investData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="value" paddingAngle={3}>
                      {investData.map((_: unknown, i: number) => <Cell key={i} fill={colors[i % colors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [fmt(Number(v as string | number))]} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-2">
                {investData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colors[i % colors.length] }} />
                      <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(d.value)}</span>
                      <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {totalInvested ? ((d.value / totalInvested) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No investment accounts detected yet.</p>
              <p className="text-xs mt-1">Connect M1 Finance or Fidelity to see your portfolio here.</p>
            </div>
          )}
        </Card>

        {/* Info card */}
        <Card>
          <CardHeader><CardTitle>Investment Accounts</CardTitle></CardHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Info className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p className="font-medium text-purple-300 mb-1">M1 Finance</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Import CSV exports from M1 Finance for holdings and activity data.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <TrendingUp className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p className="font-medium text-blue-300 mb-1">Fidelity</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Export positions CSV from Fidelity.com → Accounts → Portfolio → Download.</p>
              </div>
            </div>
          </div>
          <Link to="/upload" className="mt-4 block text-center py-2 rounded-lg text-sm text-blue-400 hover:text-blue-300 transition-colors"
            style={{ background: 'var(--bg-input)' }}>
            Import Investment Data →
          </Link>
        </Card>
      </div>
    </div>
  );
}
