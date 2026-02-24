import { useQuery, useMutation } from '../hooks/useQuery';
import { insightsApi } from '../lib/api';

import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate } from '../lib/utils';
import { Sparkles, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface Insight {
  id: string;
  sent_at: string;
  title?: string;
  message?: string;
  metadata?: string | Record<string, unknown>;
}

export function Insights() {
  const toast = useToast();
  const { data: insights = [], isLoading } = useQuery(['insights'], insightsApi.list);

  const genMutation = useMutation({
    mutationFn: () => insightsApi.generate(),
    onError: () => toast.error('Failed to generate insights'),
  });

  if (isLoading) return <PageSpinner />;

  function getContent(ins: Insight) {
    if (!ins.metadata) return ins.message ?? '';
    const meta = typeof ins.metadata === 'string' ? JSON.parse(ins.metadata) : ins.metadata;
    return meta?.narrative ?? meta?.summary ?? ins.message ?? '';
  }

  function getStats(ins: Insight) {
    if (!ins.metadata) return null;
    const meta = typeof ins.metadata === 'string' ? JSON.parse(ins.metadata) : ins.metadata;
    return meta?.stats ?? null;
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{insights.length} AI insights generated</p>
        <Button icon={<Zap className="w-4 h-4" />} variant="secondary"
          loading={genMutation.isPending}
          onClick={() => genMutation.mutate()}>
          Generate Now
        </Button>
      </div>

      {insights.length === 0 && (
        <div className="glass p-16 text-center" style={{ color: 'var(--text-muted)' }}>
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No insights yet</p>
          <p className="text-sm">Insights are auto-generated monthly. Click Generate Now to create your first one.</p>
        </div>
      )}

      <div className="space-y-4">
        {(insights as Insight[]).map((ins, i) => {
          const stats = getStats(ins);
          return (
            <motion.div key={ins.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }} className="glass p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{ins.title ?? `Monthly Financial Review`}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(ins.sent_at, 'MMMM d, yyyy')}</p>
                </div>
              </div>

              {stats && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {stats.totalIncome !== undefined && (
                    <div className="glass-sm p-3 text-center">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Income</p>
                      <p className="text-sm font-bold text-emerald-400">{fmt(stats.totalIncome)}</p>
                    </div>
                  )}
                  {stats.totalExpenses !== undefined && (
                    <div className="glass-sm p-3 text-center">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Expenses</p>
                      <p className="text-sm font-bold text-red-400">{fmt(stats.totalExpenses)}</p>
                    </div>
                  )}
                  {stats.savingsRate !== undefined && (
                    <div className="glass-sm p-3 text-center">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Savings Rate</p>
                      <p className="text-sm font-bold text-blue-400">{(stats.savingsRate * 100).toFixed(1)}%</p>
                    </div>
                  )}
                </div>
              )}

              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{getContent(ins)}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
