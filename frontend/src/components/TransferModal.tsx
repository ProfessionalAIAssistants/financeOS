import { useState } from 'react';
import { useMutation, useQueryClient } from '../hooks/useQuery';
import { useQuery } from '../hooks/useQuery';
import { Modal, ModalFooter } from './ui/Modal';
import { Button } from './ui/Button';
import { transactionsApi } from '../lib/api';
import { fmt } from '../lib/utils';
import { ArrowRight } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  type: string;
  current_balance: string;
  currency_symbol: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  color: 'var(--text-primary)',
};

const labelStyle = { color: 'var(--text-secondary)' };

const today = () => new Date().toISOString().slice(0, 10);

export function TransferModal({ open, onClose }: Props) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    source_id: '',
    destination_id: '',
    amount: '',
    date: today(),
    description: 'Transfer',
    notes: '',
  });

  const { data: accounts = [] } = useQuery<Account[]>(
    ['asset-accounts'],
    transactionsApi.accounts,
    { enabled: open }
  );

  const createMutation = useMutation({
    mutationFn: (data: unknown) => transactionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      setForm({ source_id: '', destination_id: '', amount: '', date: today(), description: 'Transfer', notes: '' });
      onClose();
    },
  });

  function handleSubmit() {
    if (!form.source_id || !form.destination_id || !form.amount) return;
    if (form.source_id === form.destination_id) {
      alert('Source and destination accounts must be different.');
      return;
    }
    createMutation.mutate({
      type: 'transfer',
      date: form.date,
      description: form.description,
      amount: form.amount,
      source_id: form.source_id,
      destination_id: form.destination_id,
      notes: form.notes || undefined,
    });
  }

  const sourceAccount = accounts.find((a: Account) => a.id === form.source_id);
  const destAccount = accounts.find((a: Account) => a.id === form.destination_id);

  const isSaving = createMutation.isPending;
  const canSubmit = form.source_id && form.destination_id && form.source_id !== form.destination_id && parseFloat(form.amount) > 0;

  return (
    <Modal open={open} onClose={onClose} title="New Transfer" size="md">
      <div className="space-y-4">
        {/* Preview banner */}
        {sourceAccount && destAccount && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm"
            style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
            <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{sourceAccount.name}</span>
            <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span className="truncate font-medium" style={{ color: 'var(--text-primary)' }}>{destAccount.name}</span>
            {form.amount && (
              <span className="ml-auto shrink-0 font-semibold" style={{ color: 'var(--accent)' }}>
                {sourceAccount.currency_symbol}{parseFloat(form.amount).toFixed(2)}
              </span>
            )}
          </div>
        )}

        {/* Source account */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>From Account</label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={inputStyle}
            value={form.source_id}
            onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))}
          >
            <option value="">Select source account...</option>
            {accounts.map((a: Account) => (
              <option key={a.id} value={a.id} disabled={a.id === form.destination_id}>
                {a.name} ({a.currency_symbol}{fmt(parseFloat(a.current_balance ?? '0'))})
              </option>
            ))}
          </select>
        </div>

        {/* Destination account */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>To Account</label>
          <select
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={inputStyle}
            value={form.destination_id}
            onChange={e => setForm(f => ({ ...f, destination_id: e.target.value }))}
          >
            <option value="">Select destination account...</option>
            {accounts.map((a: Account) => (
              <option key={a.id} value={a.id} disabled={a.id === form.source_id}>
                {a.name} ({a.currency_symbol}{fmt(parseFloat(a.current_balance ?? '0'))})
              </option>
            ))}
          </select>
        </div>

        {/* Amount + Date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={inputStyle}
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={inputStyle}
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>Description</label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={inputStyle}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>Notes (optional)</label>
          <input
            type="text"
            placeholder="Optional memo..."
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={inputStyle}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {createMutation.isError && (
          <p className="text-xs text-red-400">Failed to create transfer. Check that both accounts exist in Firefly III.</p>
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSaving}>
          {isSaving ? 'Creating...' : 'Create Transfer'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
