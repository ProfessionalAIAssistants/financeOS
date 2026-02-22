import { useQuery } from '../hooks/useQuery';
import { syncApi } from '../lib/api';
import { Card } from '../components/ui/Card';

import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmtRelative, iconForInstitution } from '../lib/utils';
import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useMutation, useQueryClient } from '../hooks/useQuery';
import { motion } from 'framer-motion';

export function Accounts() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery(['sync-status'], syncApi.status);

  const syncMutation = useMutation({
    mutationFn: (inst: string | undefined) => syncApi.force(inst),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['sync-status'] }), 5000),
  });

  if (isLoading) return <PageSpinner />;

  const institutions = status?.institutions ?? [];

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{institutions.length} connected institutions</p>
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />}
          loading={syncMutation.isPending}
          onClick={() => syncMutation.mutate(undefined)}>
          Sync All
        </Button>
      </div>

      {/* System status card */}
      <Card>
        <div className="flex items-center gap-3">
          <div className={`status-dot ${status?.firefly?.healthy ? 'green' : 'red'}`} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Firefly III</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{status?.firefly?.healthy ? 'Connected and healthy' : 'Not reachable'}</p>
          </div>
        </div>
      </Card>

      {/* Institution cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {institutions.map((inst: {
          name: string;
          method: string;
          lastSync?: string;
          lastStatus?: string;
          lastRun?: { transactions_added: number; error_message?: string };
        }, i: number) => {
          const ok = inst.lastStatus === 'success';
          const pending = !inst.lastStatus;

          return (
            <motion.div key={inst.name}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{iconForInstitution(inst.name)}</span>
                  <div>
                    <p className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{inst.name.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{inst.method?.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                {pending ? <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  : ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : <XCircle className="w-4 h-4 text-red-400" />}
              </div>

              <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex justify-between">
                  <span>Last sync</span>
                  <span>{inst.lastSync ? fmtRelative(inst.lastSync) : 'Never'}</span>
                </div>
                {inst.lastRun?.transactions_added !== undefined && (
                  <div className="flex justify-between">
                    <span>Last import</span>
                    <span className="text-emerald-400">+{inst.lastRun.transactions_added} txns</span>
                  </div>
                )}
                {inst.lastRun?.error_message && (
                  <p className="text-red-400 text-xs truncate" title={inst.lastRun.error_message}>
                    ⚠ {inst.lastRun.error_message}
                  </p>
                )}
              </div>

              <button
                onClick={() => syncMutation.mutate(inst.name)}
                disabled={syncMutation.isPending}
                className="mt-3 w-full text-xs py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              >
                Force Sync
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
