import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { insuranceApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';

import { Button } from '../components/ui/Button';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate } from '../lib/utils';
import { Shield, Plus, Sparkles, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

type PolicyType = 'home' | 'auto' | 'life' | 'health' | 'umbrella' | 'disability' | 'other';

const policyTypes: PolicyType[] = ['home', 'auto', 'life', 'health', 'umbrella', 'disability', 'other'];

interface Policy {
  id: string;
  policy_type: PolicyType;
  provider: string;
  policy_number?: string;
  coverage_amount?: string;
  premium_amount?: string;
  premium_frequency?: string;
  deductible?: string;
  renewal_date?: string;
  notes?: string;
  ai_review?: string;
}

const typeColors: Record<PolicyType, string> = {
  home:       'text-orange-400 bg-orange-400/10',
  auto:       'text-blue-400 bg-blue-400/10',
  life:       'text-emerald-400 bg-emerald-400/10',
  health:     'text-red-400 bg-red-400/10',
  umbrella:   'text-purple-400 bg-purple-400/10',
  disability: 'text-yellow-400 bg-yellow-400/10',
  other:      'text-slate-400 bg-slate-400/10',
};

export function Insurance() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [_reviewId, setReviewId] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [form, setForm] = useState({
    policyType: 'home' as PolicyType,
    provider: '', policyNumber: '', coverageAmount: '',
    premiumAmount: '', premiumFrequency: 'monthly',
    deductible: '', renewalDate: '', notes: '',
  });

  const { data: policies = [], isLoading } = useQuery(['insurance'], insuranceApi.list);

  const createMutation = useMutation({
    mutationFn: insuranceApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insurance'] }); setAddOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance'] }),
  });

  const reviewMutation = useMutation({
    mutationFn: (id: string) => insuranceApi.aiReview(id),
    onSuccess: (data) => { setReviewId(null); setReviewText(data.review); },
  });

  const totalAnnual = (policies as Policy[]).reduce((s, p) => {
    const amt = parseFloat(p.premium_amount ?? '0');
    return s + (p.premium_frequency === 'annual' ? amt : amt * 12);
  }, 0);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {fmt(totalAnnual)}<span className="text-sm font-normal" style={{ color: 'var(--text-secondary)' }}>/yr</span>
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{policies.length} policies tracked</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Add Policy</Button>
      </div>

      {/* AI review display */}
      {reviewText && (
        <Card glow="purple">
          <CardHeader>
            <CardTitle>AI Coverage Review</CardTitle>
            <button onClick={() => setReviewText('')} className="text-xs hover:text-white" style={{ color: 'var(--text-secondary)' }}>Dismiss</button>
          </CardHeader>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{reviewText}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(policies as Policy[]).map((p, i) => {
          const days = p.renewal_date ? Math.ceil((new Date(p.renewal_date).getTime() - Date.now()) / 86400000) : null;
          const expiringSoon = days !== null && days < 60 && days > 0;

          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }} className="glass p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${typeColors[p.policy_type]}`}>
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>{p.policy_type} Insurance</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.provider}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setReviewId(p.id); reviewMutation.mutate(p.id); }}
                    title="AI Coverage Review"
                    className="p-1.5 transition-colors hover:text-purple-400" style={{ color: 'var(--text-muted)' }}>
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(p.id)}
                    className="p-1.5 transition-colors hover:text-red-400" style={{ color: 'var(--text-muted)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {p.coverage_amount && (
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Coverage</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(p.coverage_amount)}</p>
                  </div>
                )}
                {p.premium_amount && (
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Premium</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(p.premium_amount)}/{p.premium_frequency?.charAt(0) ?? 'm'}</p>
                  </div>
                )}
                {p.deductible && (
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Deductible</p>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(p.deductible)}</p>
                  </div>
                )}
                {p.renewal_date && (
                  <div>
                    <p style={{ color: 'var(--text-muted)' }}>Renewal</p>
                    <p className={`font-medium ${expiringSoon ? 'text-yellow-400' : ''}`}
                      style={!expiringSoon ? { color: 'var(--text-primary)' } : undefined}>
                      {fmtDate(p.renewal_date)}
                      {expiringSoon && ` (${days}d)`}
                    </p>
                  </div>
                )}
              </div>

              {p.policy_number && (
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Policy #{p.policy_number}</p>
              )}
            </motion.div>
          );
        })}

        {policies.length === 0 && (
          <div className="col-span-full glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No policies added yet</p>
            <p className="text-sm">Track your insurance policies for AI coverage gap analysis.</p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Insurance Policy" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Policy Type</label>
            <div className="flex flex-wrap gap-2">
              {policyTypes.map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, policyType: t }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all"
                  style={form.policyType === t
                    ? { background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)', color: '#93c5fd' }
                    : { background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-muted)' }
                  }>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Provider *" value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            <input placeholder="Policy number" value={form.policyNumber} onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            <input placeholder="Coverage amount ($)" type="number" value={form.coverageAmount} onChange={e => setForm(f => ({ ...f, coverageAmount: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            <input placeholder="Premium ($)" type="number" value={form.premiumAmount} onChange={e => setForm(f => ({ ...f, premiumAmount: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            <input placeholder="Deductible ($)" type="number" value={form.deductible} onChange={e => setForm(f => ({ ...f, deductible: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            <input placeholder="Renewal date" type="date" value={form.renewalDate} onChange={e => setForm(f => ({ ...f, renewalDate: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button loading={createMutation.isPending} onClick={() => createMutation.mutate(form)} disabled={!form.provider}>
            Add Policy
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
