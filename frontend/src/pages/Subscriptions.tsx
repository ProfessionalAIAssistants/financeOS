import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { subsApi } from '../lib/api';
// Card components available if needed for future use
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate } from '../lib/utils';
import { Repeat, Zap, XCircle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface Subscription {
  id: string;
  name: string;
  amount: string;
  frequency: string;
  status: string;
  category?: string;
  last_charged?: string;
  next_expected?: string;
  ai_recommendation?: string;
}

export function Subscriptions() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'active' | 'cancelled' | 'all'>('active');

  const { data: subs = [], isLoading } = useQuery(['subs', filter], () => subsApi.list(filter));
  const { data: summary } = useQuery(['subs-summary'], subsApi.summary);

  const detectMutation = useMutation({
    mutationFn: subsApi.detect,
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['subs'] }), 5000),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => subsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subs'] }),
  });

  if (isLoading) return <PageSpinner />;

  const active = summary?.byStatus?.find((s: { status: string }) => s.status === 'active');
  const monthlyTotal = subs.filter((s: Subscription) => s.status === 'active')
    .reduce((acc: number, s: Subscription) => {
      const amt = parseFloat(s.amount ?? '0');
      return acc + (s.frequency === 'monthly' ? amt : s.frequency === 'annual' ? amt / 12 : amt);
    }, 0);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{active?.count ?? 0}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Active</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{fmt(monthlyTotal)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Per Month</p>
        </div>
        <div className="glass p-4 text-center">
          <p className="text-2xl font-bold text-orange-400">{fmt(monthlyTotal * 12)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Per Year</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['active', 'cancelled', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize"
              style={filter === f
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
              }>
              {f}
            </button>
          ))}
        </div>
        <Button variant="secondary" icon={<Zap className="w-4 h-4" />}
          loading={detectMutation.isPending}
          onClick={() => detectMutation.mutate()}>
          Re-detect
        </Button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {subs.length === 0 && (
          <div className="glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
            <Repeat className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p>No subscriptions detected yet.</p>
            <p className="text-xs mt-1">Sync your accounts to auto-detect recurring charges.</p>
          </div>
        )}
        {(subs as Subscription[]).map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="glass p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Repeat className="w-4 h-4 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</p>
                <Badge variant={s.status === 'active' ? 'success' : s.status === 'cancelled' ? 'danger' : 'warning'}>
                  {s.status}
                </Badge>
                {s.category && <Badge variant="info">{s.category}</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span className="capitalize">{s.frequency}</span>
                {s.last_charged && <span>Last: {fmtDate(s.last_charged)}</span>}
                {s.next_expected && <span>Next: {fmtDate(s.next_expected)}</span>}
              </div>
              {s.ai_recommendation && (
                <p className="text-xs text-yellow-400 mt-1">💡 {s.ai_recommendation}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(s.amount)}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.frequency === 'monthly' ? '/mo' : '/yr'}</p>
            </div>
            <div className="flex flex-col gap-1">
              {s.status === 'active' ? (
                <button onClick={() => updateMutation.mutate({ id: s.id, status: 'cancelled' })}
                  className="p-1.5 transition-colors hover:text-red-400" style={{ color: 'var(--text-muted)' }} title="Mark cancelled">
                  <XCircle className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={() => updateMutation.mutate({ id: s.id, status: 'active' })}
                  className="p-1.5 transition-colors hover:text-emerald-400" style={{ color: 'var(--text-muted)' }} title="Mark active">
                  <CheckCircle className="w-4 h-4" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
