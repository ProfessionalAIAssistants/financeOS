import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { alertsApi } from '../lib/api';

import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmtRelative, severityColor } from '../lib/utils';
import { Bell, CheckCheck, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface Alert {
  id: string;
  title?: string;
  message: string;
  severity: string;
  sent_at: string;
  read: boolean;
  rule_type?: string;
}

interface AlertRule {
  id: string;
  rule_type: string;
  threshold?: number;
  enabled: boolean;
  notify_push: boolean;
  account_filter?: string;
}

export function Alerts() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'history' | 'rules'>('history');

  const { data: alerts = [], isLoading } = useQuery(['alerts'], () => alertsApi.list(100));
  const { data: rules = [] } = useQuery(['alert-rules'], alertsApi.rules);

  const markAllMutation = useMutation({
    mutationFn: alertsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: () => toast.error('Failed to mark alerts as read'),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => alertsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
    onError: () => toast.error('Failed to mark alert as read'),
  });

  const testMutation = useMutation({
    mutationFn: alertsApi.test,
    onError: () => toast.error('Test alert failed'),
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => alertsApi.updateRule(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
    onError: () => toast.error('Failed to update alert rule'),
  });

  if (isLoading) return <PageSpinner />;

  const unread = (alerts as Alert[]).filter(a => !a.read).length;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => setTab('history')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === 'history'
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
            }>
            History {unread > 0 && <span className="ml-1.5 px-1.5 py-0.5 bg-red-500 rounded-full text-xs">{unread}</span>}
          </button>
          <button onClick={() => setTab('rules')}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === 'rules'
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
            }>
            Rules
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={<CheckCheck className="w-4 h-4" />}
            loading={markAllMutation.isPending} onClick={() => markAllMutation.mutate()}>
            Mark All Read
          </Button>
          <Button variant="secondary" size="sm" icon={<Zap className="w-4 h-4" />}
            loading={testMutation.isPending} onClick={() => testMutation.mutate()}>
            Test Push
          </Button>
        </div>
      </div>

      {/* Alert history */}
      {tab === 'history' && (
        <div className="space-y-2">
          {alerts.length === 0 && (
            <div className="glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
              <Bell className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No alerts yet. They'll appear here as events are detected.</p>
            </div>
          )}
          {(alerts as Alert[]).map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`glass p-4 flex items-start gap-4 cursor-pointer transition-colors ${!a.read ? 'border-blue-500/20' : ''}`}
              onClick={() => !a.read && markReadMutation.mutate(a.id)}
            >
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${a.read ? 'bg-slate-600' : 'bg-blue-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.title ?? a.rule_type?.replace(/_/g, ' ')}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${severityColor(a.severity)}`}>
                    {a.severity}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{a.message}</p>
              </div>
              <p className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{fmtRelative(a.sent_at)}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Alert rules */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {(rules as AlertRule[]).map(rule => (
            <div key={rule.id} className="glass p-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{rule.rule_type.replace(/_/g, ' ')}</p>
                <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {rule.threshold && <span>Threshold: {rule.threshold}</span>}
                  {rule.account_filter && <span>Account: {rule.account_filter}</span>}
                  <span className={rule.notify_push ? 'text-blue-400' : ''} style={!rule.notify_push ? { color: 'var(--text-muted)' } : undefined}>
                    {rule.notify_push ? '📱 Push on' : 'Push off'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => toggleRuleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: rule.enabled ? 'var(--accent)' : '#475569' }}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
