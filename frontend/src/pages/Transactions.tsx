import { useState } from 'react';
import { useQuery } from '../hooks/useQuery';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { TransactionEditModal } from '../components/TransactionEditModal';
import { TransferModal } from '../components/TransferModal';
import { transactionsApi } from '../lib/api';
import { fmt, fmtDate, iconForInstitution } from '../lib/utils';
import { Search, ArrowLeftRight, Pencil } from 'lucide-react';

type TxType = 'all' | 'withdrawal' | 'deposit' | 'transfer';

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

const TYPE_TABS: { key: TxType; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'withdrawal', label: 'Expenses' },
  { key: 'deposit',    label: 'Income' },
  { key: 'transfer',   label: 'Transfers' },
];

export function Transactions() {
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(1);
  const [typeFilter, setTypeFilter]   = useState<TxType>('all');
  const [editTxn, setEditTxn]         = useState<Transaction | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const PER_PAGE = 50;

  const { data, isLoading } = useQuery(
    ['transactions', page, typeFilter],
    () => transactionsApi.list(page, PER_PAGE, typeFilter === 'all' ? undefined : typeFilter)
  );

  const txns: Transaction[] = data ?? [];

  const filtered = search
    ? txns.filter(t =>
        t.description?.toLowerCase().includes(search.toLowerCase()) ||
        t.category_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase()))
      )
    : txns;

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4 pb-20 md:pb-0">

      {/* Header row: search + transfer button */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search by description, category, or tag..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-input)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <Button
          variant="secondary"
          size="md"
          icon={<ArrowLeftRight className="w-4 h-4" />}
          onClick={() => setTransferOpen(true)}
        >
          Transfer
        </Button>
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-input)' }}>
        {TYPE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setTypeFilter(tab.key); setPage(1); }}
            className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={typeFilter === tab.key ? {
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-sm)',
            } : {
              color: 'var(--text-muted)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <Card animate={false}>
        {filtered.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            <p className="text-base mb-2">No transactions found</p>
            <p className="text-sm">
              {typeFilter !== 'all'
                ? `No ${typeFilter} transactions on this page.`
                : 'Import or sync your accounts to see transactions here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map((t, i) => {
              const amount = parseFloat(t.amount ?? '0');
              const isTransfer = t.type === 'transfer';
              const isDebit    = t.type === 'withdrawal' || (!isTransfer && amount < 0);
              const isCredit   = t.type === 'deposit'    || (!isTransfer && amount >= 0);

              const amountColor = isTransfer
                ? 'var(--accent)'
                : isDebit ? '#f87171' : '#34d399';

              return (
                <div
                  key={t.id ?? i}
                  className="flex items-start py-3 gap-3 group"
                >
                  {/* Institution icon */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5"
                    style={{ background: 'var(--bg-input)' }}>
                    {isTransfer
                      ? <ArrowLeftRight className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                      : iconForInstitution(t.source_name ?? '')}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {t.description}
                    </p>

                    {/* Date, category, tags row */}
                    <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(t.date)}</span>

                      {t.category_name && (
                        <Badge variant="info">{t.category_name}</Badge>
                      )}

                      {t.tags && t.tags.length > 0 && t.tags.map(tag => (
                        <span key={tag}
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs"
                          style={{ background: 'var(--bg-input)', color: 'var(--accent)', border: '1px solid var(--border-active)' }}>
                          {tag}
                        </span>
                      ))}

                      {isTransfer && t.destination_name && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          → {t.destination_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount + edit button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-semibold" style={{ color: amountColor }}>
                      {isDebit ? '-' : isCredit ? '+' : ''}
                      {fmt(Math.abs(amount))}
                    </p>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg"
                      style={{ color: 'var(--text-muted)' }}
                      title="Edit transaction"
                      onClick={() => setEditTxn(t)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Pagination */}
      <div className="flex justify-center gap-3">
        <button disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
          className="px-4 py-2 glass text-sm disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}>
          Previous
        </button>
        <span className="px-4 py-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page}</span>
        <button
          disabled={filtered.length < PER_PAGE}
          onClick={() => setPage(p => p + 1)}
          className="px-4 py-2 glass text-sm disabled:opacity-40"
          style={{ color: 'var(--text-secondary)' }}>
          Next
        </button>
      </div>

      {/* Modals */}
      <TransactionEditModal
        transaction={editTxn}
        open={!!editTxn}
        onClose={() => setEditTxn(null)}
      />
      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
      />
    </div>
  );
}
