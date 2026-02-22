import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { forecastApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Zap, TrendingUp } from 'lucide-react';

export function Forecasting() {
  const qc = useQueryClient();
  const [horizon, setHorizon] = useState(12);
  const [whatIf, setWhatIf] = useState({
    incomeChangePct: 0,
    expenseChangePct: 0,
    extraMonthlySavings: 0,
  });
  const [whatIfResult, setWhatIfResult] = useState<null | {
    baseline: Array<{ month: number; netWorth: number }>;
    whatIf: Array<{ month: number; netWorth: number }>;
    assumptions: Record<string, number>;
  }>(null);

  const { data: forecast, isLoading } = useQuery(['forecast', horizon], () => forecastApi.latest(horizon));

  const genMutation = useMutation({
    mutationFn: () => forecastApi.generate(horizon),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['forecast'] }), 3000),
  });

  const whatIfMutation = useMutation({
    mutationFn: () => forecastApi.whatif({ ...whatIf, horizon }),
    onSuccess: (data) => setWhatIfResult(data),
  });

  if (isLoading) return <PageSpinner />;

  const scenarios = forecast?.scenarios;
  const summary = forecast?.summary;

  // Build chart data from forecast scenarios
  const chartData = scenarios?.base?.map((pt: { month: number; netWorth: number }, i: number) => ({
    month: `Mo ${pt.month}`,
    base: pt.netWorth,
    optimistic: scenarios.optimistic?.[i]?.netWorth,
    pessimistic: scenarios.pessimistic?.[i]?.netWorth,
    whatIfVal: whatIfResult?.whatIf?.[i]?.netWorth,
  })) ?? [];

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[6, 12, 24, 60].map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={horizon === h
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
              }>
              {h}mo
            </button>
          ))}
        </div>
        <Button icon={<Zap className="w-4 h-4" />} loading={genMutation.isPending}
          onClick={() => genMutation.mutate()} variant="secondary">
          Regenerate
        </Button>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>FI/RE Number</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(summary.fireNumber)}</p>
          </div>
          <div className="glass p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Months to FI/RE</p>
            <p className="text-xl font-bold text-emerald-400">{summary.monthsToFire ?? '—'}</p>
          </div>
          <div className="glass p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Projected (Base)</p>
            <p className="text-xl font-bold text-blue-400">{fmt(scenarios?.base?.at(-1)?.netWorth ?? 0)}</p>
          </div>
          <div className="glass p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Monthly Savings</p>
            <p className="text-xl font-bold text-purple-400">{fmt(summary.avgMonthlySavings ?? 0)}</p>
          </div>
        </div>
      )}

      {/* Main chart */}
      {chartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Net Worth Projection — {horizon} Months</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
                {/* @ts-expect-error recharts formatter types */}
                <Tooltip formatter={(v: unknown, n: string) => [fmt(Number(v)), n]} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
                {summary?.fireNumber && <ReferenceLine y={summary.fireNumber} stroke="#34d399" strokeDasharray="4 2" label={{ value: 'FI/RE', fill: '#34d399', fontSize: 11 }} />}
                <Line type="monotone" dataKey="optimistic" name="Optimistic" stroke="#34d399" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="base"       name="Base"       stroke="#60a5fa" strokeWidth={2}   dot={false} />
                <Line type="monotone" dataKey="pessimistic"name="Pessimistic"stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                {whatIfResult && <Line type="monotone" dataKey="whatIfVal" name="What-If" stroke="#fbbf24" strokeWidth={2} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : (
        <div className="glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>No forecast generated yet</p>
          <p className="text-sm mb-4">You need at least 30 days of net worth snapshots.</p>
          <Button onClick={() => genMutation.mutate()} loading={genMutation.isPending}>Generate Forecast</Button>
        </div>
      )}

      {/* What-If calculator */}
      <Card glow="purple">
        <CardHeader><CardTitle>What-If Calculator</CardTitle></CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Income Change %</label>
            <input type="number" value={whatIf.incomeChangePct}
              onChange={e => setWhatIf(w => ({ ...w, incomeChangePct: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Expense Change %</label>
            <input type="number" value={whatIf.expenseChangePct}
              onChange={e => setWhatIf(w => ({ ...w, expenseChangePct: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Extra Monthly Savings $</label>
            <input type="number" value={whatIf.extraMonthlySavings}
              onChange={e => setWhatIf(w => ({ ...w, extraMonthlySavings: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        {whatIfResult?.assumptions && (
          <div className="grid grid-cols-3 gap-3 mb-4 text-xs text-center">
            <div className="glass-sm p-3">
              <p style={{ color: 'var(--text-secondary)' }}>Adj. Monthly Income</p>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(whatIfResult.assumptions.adjustedMonthlyIncome)}</p>
            </div>
            <div className="glass-sm p-3">
              <p style={{ color: 'var(--text-secondary)' }}>Adj. Monthly Expenses</p>
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(whatIfResult.assumptions.adjustedMonthlyExpenses)}</p>
            </div>
            <div className="glass-sm p-3">
              <p style={{ color: 'var(--text-secondary)' }}>Monthly Improvement</p>
              <p className={`font-medium ${whatIfResult.assumptions.monthlyImprovementVsBaseline >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {whatIfResult.assumptions.monthlyImprovementVsBaseline >= 0 ? '+' : ''}{fmt(whatIfResult.assumptions.monthlyImprovementVsBaseline)}
              </p>
            </div>
          </div>
        )}
        <Button icon={<Zap className="w-4 h-4" />} loading={whatIfMutation.isPending}
          onClick={() => whatIfMutation.mutate()} disabled={!forecast}>
          Calculate What-If
        </Button>
      </Card>
    </div>
  );
}
