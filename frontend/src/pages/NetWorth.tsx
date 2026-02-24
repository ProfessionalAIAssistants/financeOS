import { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '../hooks/useQuery';
import { networthApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate, pctChange } from '../lib/utils';
import { Camera } from 'lucide-react';
import { useMutation, useQueryClient } from '../hooks/useQuery';
import { useToast } from '../components/ui/Toast';

const RANGES = [30, 90, 180, 365] as const;

export function NetWorth() {
  const [days, setDays] = useState<typeof RANGES[number]>(365);
  const qc = useQueryClient();
  const toast = useToast();

  const { data: current, isLoading } = useQuery(['nw-current'], networthApi.current);
  const { data: history = [] } = useQuery(['nw-history', days], () => networthApi.history(days));
  const { data: breakdown } = useQuery(['nw-breakdown'], networthApi.breakdown);

  const snapMutation = useMutation({
    mutationFn: networthApi.snapshot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nw-current'] }),
    onError: () => toast.error('Snapshot failed. Please try again.'),
  });

  if (isLoading) return <PageSpinner />;

  const netWorth = parseFloat(current?.net_worth ?? '0');
  const assets   = parseFloat(current?.total_assets ?? '0');
  const liabs    = parseFloat(current?.total_liabilities ?? '0');

  const prev = history.length > 1 ? parseFloat(history[0]?.net_worth ?? '0') : null;
  const change = prev !== null ? pctChange(netWorth, prev) : undefined;

  const chartData = history.map((h: { snapshot_date: string; net_worth: string; total_assets: string; total_liabilities: string }) => ({
    date: fmtDate(h.snapshot_date, 'MMM d'),
    netWorth: parseFloat(h.net_worth),
    assets:   parseFloat(h.total_assets),
    liabs:    parseFloat(h.total_liabilities),
  }));

  // Breakdown by category from breakdown JSON
  const breakdownData = breakdown ? Object.entries(breakdown).map(([key, val]) => ({
    name: key.replace(/_/g, ' '),
    value: parseFloat(String(val)),
  })).filter(d => d.value > 0) : [];

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-bold gradient-text">{fmt(netWorth)}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{fmtDate(current?.snapshot_date)} snapshot</p>
        </div>
        <Button variant="secondary" icon={<Camera className="w-4 h-4" />}
          loading={snapMutation.isPending}
          onClick={() => snapMutation.mutate()}>
          Snapshot Now
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Net Worth"        value={netWorth} change={change} glow="blue" />
        <StatCard title="Total Assets"     value={assets}   glow="green" />
        <StatCard title="Total Liabilities"value={liabs}    glow="red" />
      </div>

      {/* Range selector */}
      <div className="flex gap-2">
        {RANGES.map(r => (
          <button key={r}
            onClick={() => setDays(r)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={days === r
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
            }>
            {r}d
          </button>
        ))}
      </div>

      {/* Area chart */}
      <Card>
        <CardHeader><CardTitle>Net Worth Over Time</CardTitle></CardHeader>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No history yet — take a snapshot to start tracking.</p>
          </div>
        ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="liabsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="nwGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
              {/* @ts-expect-error recharts formatter types */}
              <Tooltip formatter={(v: unknown, n: string) => [fmt(Number(v)), n]} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
              <Area type="monotone" dataKey="assets"   name="Assets"      stroke="#34d399" strokeWidth={1.5} fill="url(#assetsGrad)" dot={false} />
              <Area type="monotone" dataKey="liabs"    name="Liabilities" stroke="#f87171" strokeWidth={1.5} fill="url(#liabsGrad)"  dot={false} />
              <Area type="monotone" dataKey="netWorth" name="Net Worth"   stroke="#60a5fa" strokeWidth={2}   fill="url(#nwGrad2)"    dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        )}
      </Card>

      {/* Breakdown bar */}
      {breakdownData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Asset Breakdown</CardTitle></CardHeader>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdownData} layout="vertical" margin={{ left: 80, right: 20, top: 4, bottom: 4 }}>
                <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={80} />
                <Tooltip formatter={(v: unknown) => [fmt(Number(v as string | number))]} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
                <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
