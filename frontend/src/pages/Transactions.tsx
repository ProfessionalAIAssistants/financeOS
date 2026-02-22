import { useState, useEffect, useRef } from 'react';
import { useQuery } from '../hooks/useQuery';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { TransactionEditModal } from '../components/TransactionEditModal';
import { TransferModal } from '../components/TransferModal';
import { transactionsApi } from '../lib/api';
import { fmt, fmtDate, iconForInstitution } from '../lib/utils';
import { Search, ArrowLeftRight, Pencil, X, Calendar } from 'lucide-react';

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

const inputStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  color: 'var(--text-primary)',
};

export function Transactions() {
  const [search, setSearch]             = useState('');
  const [debouncedSearch, setDebounced] = useState('');
  const [page, setPage]                 = useState(1);
  const [typeFilter, setTypeFilter]     = useState<TxType>('all');
  const [startDate, setStartDate]       = useState('');
  const [endDate, setEndDate]           = useState('');
  const [editTxn, setEditTxn]           = useState<Transaction | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PER_PAGE = 50;

  // Debounce search input — wait 400ms before hitting the API
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 400);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [search]);

  const hasFilters = debouncedSearch || startDate || endDate || typeFilter !== 'all';

  const { data, isLoading } = useQuery(
    ['transactions', page, typeFilter, debouncedSearch, startDate, endDate],
    () => transactionsApi.list(
      page,
      PER_PAGE,
      typeFilter === 'all' ? undefined : typeFilter,
      undefined,
      debouncedSearch || undefined,
      startDate || undefined,
      endDate   || undefined,
    )
  );

  const txns: Transaction[] = data ?? [];

  function clearFilters() {
    setSearch('');
    setDebounced('');
    setStartDate('');
    setEndDate('');
    setTypeFilter('all');
    setPage(1);
  }

  if (isLoading && page === 1 && !hasFilters) return <PageSpinner />;

  return (
    <div className="space-y-4 pb-20 md:pb-0">

      {/* Search row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search description, category, or tag…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none"
            style={inputStyle}
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => setSearch('')}
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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

      {/* Date range row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
        <input
          type="date"
          value={startDate}
          onChange={e => { setStartDate(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={inputStyle}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
        <input
          type="date"
          value={endDate}
          onChange={e => { setEndDate(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg text-xs focus:outline-none"
          style={inputStyle}
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--accent)' }}
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}
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
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : txns.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
            <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-base mb-2" style={{ color: 'var(--text-secondary)' }}>
              {hasFilters ? 'No transactions match your filters' : 'No transactions found'}
            </p>
            <p className="text-sm">
              {hasFilters
                ? 'Try adjusting your search or date range.'
                : 'Import or sync your accounts to see transactions here.'}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 text-sm px-4 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--bg-input)', color: 'var(--accent)' }}
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {txns.map((t, i) => {
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
          disabled={txns.length < PER_PAGE}
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
