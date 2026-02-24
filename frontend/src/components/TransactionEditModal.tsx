import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '../hooks/useQuery';
import { useQuery } from '../hooks/useQuery';
import { Modal, ModalFooter } from './ui/Modal';
import { ConfirmModal } from './ui/ConfirmModal';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { transactionsApi, tagsApi } from '../lib/api';
import { X, Plus } from 'lucide-react';

interface Transaction {
  id: string;
  transaction_journal_id?: string;
  date: string;
  description: string;
  amount: string;
  type: string;
  category_name?: string;
  category_id?: string;
  source_name?: string;
  destination_name?: string;
  tags?: string[];
  notes?: string;
  budget_name?: string;
}

interface Category {
  id: string;
  name: string;
}

interface Tag {
  id?: string;
  attributes?: { tag: string; description?: string };
}

interface Props {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
}

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  color: 'var(--text-primary)',
};

const labelStyle = { color: 'var(--text-secondary)' };

export function TransactionEditModal({ transaction, open, onClose }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: '',
    category_name: '',
    notes: '',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  // Populate form when transaction changes
  useEffect(() => {
    if (transaction) {
      setForm({
        description: transaction.description ?? '',
        amount: transaction.amount ?? '',
        date: transaction.date ? transaction.date.slice(0, 10) : '',
        category_name: transaction.category_name ?? '',
        notes: transaction.notes ?? '',
        tags: transaction.tags ?? [],
      });
      setTagInput('');
      setShowNewCategory(false);
      setNewCategory('');
    }
  }, [transaction]);

  const { data: categories = [] } = useQuery<Category[]>(
    ['tx-categories'],
    transactionsApi.categories,
    { enabled: open }
  );

  const { data: allTags = [] } = useQuery<Tag[]>(
    ['tags'],
    tagsApi.list,
    { enabled: open }
  );

  const tagNames = allTags.map((t: Tag) => t.attributes?.tag ?? '').filter(Boolean);

  const updateMutation = useMutation({
    mutationFn: (data: unknown) => transactionsApi.update(transaction!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast('Transaction updated', 'success');
      onClose();
    },
    onError: () => toast('Failed to update transaction', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => transactionsApi.delete(transaction!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast('Transaction deleted', 'success');
      onClose();
    },
    onError: () => toast('Failed to delete transaction', 'error'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => transactionsApi.createCategory(name),
    onSuccess: (cat: Category) => {
      qc.invalidateQueries({ queryKey: ['tx-categories'] });
      setForm(f => ({ ...f, category_name: cat.name }));
      setShowNewCategory(false);
      setNewCategory('');
    },
    onError: () => toast('Failed to create category', 'error'),
  });

  function addTag(tag: string) {
    const t = tag.trim();
    if (t && !form.tags.includes(t)) {
      setForm(f => ({ ...f, tags: [...f.tags, t] }));
    }
    setTagInput('');
  }

  function removeTag(tag: string) {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  }

  function handleSave() {
    const payload: Record<string, unknown> = {
      description: form.description,
      amount: form.amount,
      date: form.date,
      category_name: form.category_name || null,
      notes: form.notes || null,
      tags: form.tags,
    };
    updateMutation.mutate(payload);
  }

  function handleDelete() {
    setConfirmDelete(true);
  }

  const isSaving = updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  return (
    <>
    <ConfirmModal
      open={confirmDelete}
      title="Delete transaction?"
      message={`"${transaction?.description}" will be permanently deleted. This cannot be undone.`}
      confirmLabel="Delete"
      onConfirm={() => deleteMutation.mutate()}
      onClose={() => setConfirmDelete(false)}
    />
    <Modal open={open} onClose={onClose} title="Edit Transaction" size="lg">
      <div className="space-y-4">
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

        {/* Amount + Date row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={labelStyle}>Amount</label>
            <input
              type="number"
              step="0.01"
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

        {/* Category */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>Category</label>
          {showNewCategory ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New category name..."
                className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={inputStyle}
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createCategoryMutation.mutate(newCategory); }}
              />
              <Button size="sm" onClick={() => createCategoryMutation.mutate(newCategory)}
                disabled={!newCategory.trim() || createCategoryMutation.isPending}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewCategory(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={inputStyle}
                value={form.category_name}
                onChange={e => setForm(f => ({ ...f, category_name: e.target.value }))}
              >
                <option value="">— None —</option>
                {categories.map((c: Category) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button
                className="px-3 py-2 rounded-lg text-xs whitespace-nowrap"
                style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-input)' }}
                onClick={() => setShowNewCategory(true)}
              >
                + New
              </button>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>Tags</label>
          {/* Existing tag chips */}
          {form.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(tag => (
                <span key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: 'var(--bg-input)', color: 'var(--accent)', border: '1px solid var(--border-active)' }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Tag input with autocomplete */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Add tag..."
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={inputStyle}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                list="tag-suggestions"
              />
              <datalist id="tag-suggestions">
                {tagNames.filter((t: string) => !form.tags.includes(t)).map((t: string) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <button
              className="px-3 py-2 rounded-lg"
              style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-input)' }}
              onClick={() => addTag(tagInput)}
              disabled={!tagInput.trim()}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Press Enter or comma to add. Type to see existing tags.</p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium mb-1" style={labelStyle}>Notes</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
            style={inputStyle}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {/* Info row */}
        <div className="text-xs py-2 px-3 rounded-lg" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>Account:</span>{' '}
          {transaction?.source_name ?? '—'}
          {transaction?.destination_name && transaction.type === 'transfer' && (
            <> → {transaction.destination_name}</>
          )}
          <span className="ml-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Type:</span>{' '}
          <span className="capitalize">{transaction?.type}</span>
        </div>
      </div>

      <ModalFooter className="flex-wrap gap-2">
        <button
          className="mr-auto text-xs px-3 py-2 rounded-lg transition-colors"
          style={{ color: '#f87171', background: 'transparent' }}
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? 'Deleting...' : 'Delete transaction'}
        </button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
}
