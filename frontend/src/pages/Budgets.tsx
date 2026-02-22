import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { budgetsApi } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, fmtDate } from '../lib/utils';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, PiggyBank } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BudgetAttrs {
  name: string;
  active: boolean;
  spent: Array<{ amount: string; currency_symbol: string }>;
  auto_budget_type?: string;
  auto_budget_amount?: string;
  auto_budget_period?: string;
}

interface Budget {
  id: string;
  attributes: BudgetAttrs;
}

interface LimitAttrs {
  start: string;
  end: string;
  amount: string;
  currency_symbol: string;
  spent: string;
}

interface BudgetLimit {
  id: string;
  attributes: LimitAttrs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  color: 'var(--text-primary)',
};
const labelStyle = { color: 'var(--text-secondary)' };

function periodStart(period: string): string {
  const now = new Date();
  if (period === 'monthly') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.setDate(diff)).toISOString().slice(0, 10);
  }
  if (period === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
  }
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function periodEnd(period: string): string {
  const now = new Date();
  if (period === 'monthly') return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() + (7 - day);
    return new Date(now.setDate(diff)).toISOString().slice(0, 10);
  }
  if (period === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10);
  }
  return new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
}

function spentPercent(spent: number, limit: number): number {
  if (!limit) return 0;
  return Math.min(100, (spent / limit) * 100);
}

function progressColor(pct: number): string {
  if (pct >= 100) return '#f87171';
  if (pct >= 80) return '#fbbf24';
  return '#34d399';
}

// ── Budget Form State ─────────────────────────────────────────────────────────

interface BudgetFormState {
  name: string;
  active: boolean;
  limitAmount: string;
  limitPeriod: 'monthly' | 'weekly' | 'quarterly' | 'yearly';
}

const defaultForm = (): BudgetFormState => ({
  name: '',
  active: true,
  limitAmount: '',
  limitPeriod: 'monthly',
});

// ── Main component ────────────────────────────────────────────────────────────

export function Budgets() {
  const qc = useQueryClient();

  const [addOpen, setAddOpen]         = useState(false);
  const [editBudget, setEditBudget]   = useState<Budget | null>(null);
  const [form, setForm]               = useState<BudgetFormState>(defaultForm());
  const [expanded, setExpanded]       = useState<string | null>(null);

  // ── Budget CRUD ──
  const { data: budgetsRaw = [], isLoading } = useQuery<Budget[]>(['budgets'], budgetsApi.list);

  const createMutation = useMutation({
    mutationFn: async (f: BudgetFormState) => {
      const budget = await budgetsApi.create({ name: f.name, active: f.active });
      if (f.limitAmount && parseFloat(f.limitAmount) > 0) {
        await budgetsApi.createLimit(budget.id, {
          start: periodStart(f.limitPeriod),
          end: periodEnd(f.limitPeriod),
          amount: f.limitAmount,
        });
      }
      return budget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setAddOpen(false);
      setForm(defaultForm());
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: BudgetFormState }) => {
      await budgetsApi.update(id, { name: f.name, active: f.active });
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setEditBudget(null);
      setForm(defaultForm());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => budgetsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  });

  function openEdit(b: Budget) {
    setEditBudget(b);
    setForm({
      name: b.attributes.name,
      active: b.attributes.active,
      limitAmount: b.attributes.auto_budget_amount ?? '',
      limitPeriod: (b.attributes.auto_budget_period as BudgetFormState['limitPeriod']) ?? 'monthly',
    });
  }

  function handleDelete(b: Budget) {
    if (confirm(`Delete budget "${b.attributes.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(b.id);
    }
  }

  // ── Summary numbers ──
  const totalBudgeted = budgetsRaw.reduce((s: number, b: Budget) => {
    return s + parseFloat(b.attributes.auto_budget_amount ?? '0');
  }, 0);

  const totalSpent = budgetsRaw.reduce((s: number, b: Budget) => {
    const spent = b.attributes.spent?.[0]?.amount ?? '0';
    return s + Math.abs(parseFloat(spent));
  }, 0);

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6 pb-20 md:pb-0">

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="text-center py-5">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total Budgeted</p>
          <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(totalBudgeted)}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>this period</p>
        </Card>
        <Card className="text-center py-5">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Total Spent</p>
          <p className="text-xl font-bold" style={{ color: totalSpent > totalBudgeted ? '#f87171' : '#34d399' }}>
            {fmt(totalSpent)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>this period</p>
        </Card>
        <Card className="text-center py-5 col-span-2 md:col-span-1">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Remaining</p>
          <p className="text-xl font-bold"
            style={{ color: totalBudgeted - totalSpent >= 0 ? '#34d399' : '#f87171' }}>
            {fmt(Math.abs(totalBudgeted - totalSpent))}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalBudgeted - totalSpent >= 0 ? 'left to spend' : 'over budget'}
          </p>
        </Card>
      </div>

      {/* Budget list header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
          Budgets ({budgetsRaw.length})
        </h2>
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => { setForm(defaultForm()); setAddOpen(true); }}>
          New Budget
        </Button>
      </div>

      {/* Budget cards */}
      {budgetsRaw.length === 0 ? (
        <Card>
          <div className="text-center py-14" style={{ color: 'var(--text-muted)' }}>
            <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base mb-1">No budgets yet</p>
            <p className="text-sm">Create a budget to start tracking your spending against limits.</p>
            <Button className="mt-5" size="sm" icon={<Plus className="w-4 h-4" />}
              onClick={() => setAddOpen(true)}>
              Create your first budget
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {budgetsRaw.map((b: Budget) => {
            const spentAmt   = Math.abs(parseFloat(b.attributes.spent?.[0]?.amount ?? '0'));
            const limitAmt   = parseFloat(b.attributes.auto_budget_amount ?? '0');
            const pct        = spentPercent(spentAmt, limitAmt);
            const color      = progressColor(pct);
            const remaining  = limitAmt - spentAmt;
            const isExpanded = expanded === b.id;

            return (
              <Card key={b.id} animate={false}>
                {/* Row */}
                <div className="flex items-center gap-3">
                  {/* Expand toggle */}
                  <button
                    className="shrink-0 p-1 rounded"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setExpanded(isExpanded ? null : b.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {b.attributes.name}
                      </span>
                      {!b.attributes.active && <Badge variant="warning">Inactive</Badge>}
                      {b.attributes.auto_budget_period && (
                        <Badge variant="info" className="capitalize">{b.attributes.auto_budget_period}</Badge>
                      )}
                    </div>

                    {/* Progress bar */}
                    {limitAmt > 0 && (
                      <>
                        <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: 'var(--bg-input)' }}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="h-full rounded-full"
                            style={{ background: color }}
                          />
                        </div>
                        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                          <span>{fmt(spentAmt)} spent</span>
                          <span style={{ color: remaining >= 0 ? color : '#f87171' }}>
                            {remaining >= 0 ? `${fmt(remaining)} left` : `${fmt(Math.abs(remaining))} over`}
                          </span>
                          <span>of {fmt(limitAmt)}</span>
                        </div>
                      </>
                    )}
                    {!limitAmt && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {fmt(spentAmt)} spent — no limit set
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Edit budget"
                      onClick={() => openEdit(b)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete budget"
                      onClick={() => handleDelete(b)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded: spending limit details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <BudgetLimitPanel budgetId={b.id} budgetName={b.attributes.name} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <BudgetFormModal
        open={addOpen || !!editBudget}
        isEdit={!!editBudget}
        form={form}
        setForm={setForm}
        isSaving={createMutation.isPending || updateMutation.isPending}
        onClose={() => { setAddOpen(false); setEditBudget(null); setForm(defaultForm()); }}
        onSave={() => {
          if (editBudget) {
            updateMutation.mutate({ id: editBudget.id, f: form });
          } else {
            createMutation.mutate(form);
          }
        }}
      />
    </div>
  );
}

// ── Budget Form Modal ─────────────────────────────────────────────────────────

function BudgetFormModal({
  open, isEdit, form, setForm, isSaving, onClose, onSave,
}: {
  open: boolean;
  isEdit: boolean;
  form: BudgetFormState;
  setForm: React.Dispatch<React.SetStateAction<BudgetFormState>>;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Budget' : 'New Budget'} size="md">
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>Budget Name</label>
          <input
            type="text"
            placeholder="e.g. Groceries, Entertainment, Gas..."
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={inputStyle}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>

        {/* Spending limit */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>
            Spending Limit <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={inputStyle}
              value={form.limitAmount}
              onChange={e => setForm(f => ({ ...f, limitAmount: e.target.value }))}
            />
            <select
              className="px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={inputStyle}
              value={form.limitPeriod}
              onChange={e => setForm(f => ({ ...f, limitPeriod: e.target.value as BudgetFormState['limitPeriod'] }))}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>

        {/* Active toggle */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
            />
            <div className="w-10 h-5 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:transition-all"
              style={{
                background: form.active ? 'var(--accent)' : 'var(--bg-input)',
                border: '1px solid var(--border-input)',
              }}
            />
          </label>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {form.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} disabled={!form.name.trim() || isSaving}>
          {isSaving ? 'Saving...' : isEdit ? 'Save changes' : 'Create Budget'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ── Budget Limit Panel (expanded view) ───────────────────────────────────────

function BudgetLimitPanel({ budgetId, budgetName }: { budgetId: string; budgetName: string }) {
  const qc = useQueryClient();
  const [addLimitOpen, setAddLimitOpen] = useState(false);
  const [limitForm, setLimitForm] = useState({ start: '', end: '', amount: '' });

  const { data: limits = [] } = useQuery<BudgetLimit[]>(
    ['budget-limits', budgetId],
    () => budgetsApi.limits(budgetId)
  );

  const createLimitMutation = useMutation({
    mutationFn: (d: unknown) => budgetsApi.createLimit(budgetId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-limits', budgetId] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setAddLimitOpen(false);
      setLimitForm({ start: '', end: '', amount: '' });
    },
  });

  const deleteLimitMutation = useMutation({
    mutationFn: (limitId: string) => budgetsApi.deleteLimit(budgetId, limitId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budget-limits', budgetId] });
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
  });

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Spending Limits</p>
        <button
          className="text-xs px-2 py-1 rounded"
          style={{ background: 'var(--bg-input)', color: 'var(--accent)' }}
          onClick={() => setAddLimitOpen(true)}
        >
          + Add limit
        </button>
      </div>

      {limits.length === 0 ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>No spending limits defined for this budget.</p>
      ) : (
        <div className="space-y-2">
          {limits.map((l: BudgetLimit) => {
            const spent = Math.abs(parseFloat(l.attributes.spent ?? '0'));
            const limit = parseFloat(l.attributes.amount ?? '0');
            const pct   = spentPercent(spent, limit);
            const color = progressColor(pct);
            return (
              <div key={l.id} className="flex items-center gap-3 text-xs">
                <div className="flex-1">
                  <div className="flex justify-between mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    <span>{fmtDate(l.attributes.start)} – {fmtDate(l.attributes.end)}</span>
                    <span style={{ color }}>{fmt(spent)} / {fmt(limit)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
                <button
                  className="shrink-0 p-1 rounded"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => deleteLimitMutation.mutate(l.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add limit modal */}
      <Modal open={addLimitOpen} onClose={() => setAddLimitOpen(false)} title={`Add Limit — ${budgetName}`} size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>Start</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={inputStyle} value={limitForm.start}
                onChange={e => setLimitForm(f => ({ ...f, start: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={labelStyle}>End</label>
              <input type="date" className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={inputStyle} value={limitForm.end}
                onChange={e => setLimitForm(f => ({ ...f, end: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>Amount</label>
            <input type="number" step="0.01" min="0.01" placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={inputStyle} value={limitForm.amount}
              onChange={e => setLimitForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setAddLimitOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createLimitMutation.mutate(limitForm)}
            disabled={!limitForm.start || !limitForm.end || !limitForm.amount || createLimitMutation.isPending}
          >
            {createLimitMutation.isPending ? 'Saving...' : 'Add Limit'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
