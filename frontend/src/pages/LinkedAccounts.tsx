import { useState, useCallback } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';
import { plaidApi } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useToast } from '../components/ui/Toast';
import { fmt, fmtRelative, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, RefreshCw, Trash2, Building2, CreditCard, Wallet, TrendingUp,
  PiggyBank, AlertTriangle, CheckCircle2, Eye, EyeOff,
  Landmark, DollarSign, ShieldAlert, ExternalLink,
} from 'lucide-react';

// ── Plaid Link Launcher Component ─────────────────────────────────────────────
function PlaidLinkButton({
  linkToken,
  onSuccess,
  loading,
  variant = 'primary',
  children,
}: {
  linkToken: string;
  onSuccess: PlaidLinkOnSuccess;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  return (
    <Button
      variant={variant}
      onClick={() => open()}
      disabled={!ready || loading}
      loading={loading}
      icon={<Plus className="w-4 h-4" />}
    >
      {children}
    </Button>
  );
}

// ── Account type icon ─────────────────────────────────────────────────────────
function AccountIcon({ type, subtype }: { type: string; subtype?: string }) {
  const cls = "w-4 h-4";
  if (type === 'credit') return <CreditCard className={cls} />;
  if (type === 'investment') return <TrendingUp className={cls} />;
  if (type === 'loan') return <DollarSign className={cls} />;
  if (subtype === 'savings') return <PiggyBank className={cls} />;
  if (subtype === 'checking') return <Wallet className={cls} />;
  return <Building2 className={cls} />;
}

// ── Account type colors ───────────────────────────────────────────────────────
function accountGradient(type: string): string {
  const map: Record<string, string> = {
    depository: 'from-blue-500 to-cyan-500',
    credit: 'from-red-500 to-rose-500',
    investment: 'from-purple-500 to-violet-500',
    loan: 'from-orange-500 to-amber-500',
    brokerage: 'from-emerald-500 to-teal-500',
  };
  return map[type] ?? 'from-slate-500 to-slate-600';
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'good') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </span>
    );
  }
  if (status === 'login_required') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
        <ShieldAlert className="w-3 h-3" /> Login Required
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
      <AlertTriangle className="w-3 h-3" /> Error
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function LinkedAccounts() {
  const qc = useQueryClient();
  const toast = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [updateItemId, setUpdateItemId] = useState<string | null>(null);
  const [updateLinkToken, setUpdateLinkToken] = useState<string | null>(null);

  // Fetch linked bank items
  const { data: items, isLoading } = useQuery(['plaid-items'], plaidApi.items);

  // Create link token for new connection
  const handleAddBank = useCallback(async () => {
    setIsCreatingToken(true);
    try {
      const { linkToken: token } = await plaidApi.createLinkToken();
      setLinkToken(token);
    } catch (err) {
      toast('Failed to initialize bank connection', 'error');
      console.error(err);
    } finally {
      setIsCreatingToken(false);
    }
  }, [toast]);

  // Create link token for re-authentication (update mode)
  const handleReauth = useCallback(async (itemId: string) => {
    setUpdateItemId(itemId);
    try {
      const { linkToken: token } = await plaidApi.createLinkToken(itemId);
      setUpdateLinkToken(token);
    } catch (err) {
      toast('Failed to initialize re-authentication', 'error');
      console.error(err);
      setUpdateItemId(null);
    }
  }, [toast]);

  // Exchange token after successful link
  const handleLinkSuccess: PlaidLinkOnSuccess = useCallback(async (publicToken, metadata) => {
    try {
      await plaidApi.exchange(
        publicToken,
        metadata.institution?.institution_id,
        metadata.institution?.name,
      );
      toast(`${metadata.institution?.name ?? 'Bank'} connected successfully!`, 'success');
      qc.invalidateQueries({ queryKey: ['plaid-items'] });
      setLinkToken(null);
    } catch (err) {
      toast('Failed to connect bank', 'error');
      console.error(err);
    }
  }, [qc, toast]);

  // Re-auth success
  const handleUpdateSuccess: PlaidLinkOnSuccess = useCallback(async (_publicToken, metadata) => {
    toast(`${metadata.institution?.name ?? 'Bank'} re-authenticated!`, 'success');
    qc.invalidateQueries({ queryKey: ['plaid-items'] });
    setUpdateItemId(null);
    setUpdateLinkToken(null);
  }, [qc, toast]);

  // Sync mutations
  const syncMutation = useMutation({
    mutationFn: (itemId: string) => plaidApi.syncItem(itemId),
    onSuccess: () => {
      toast('Sync complete', 'success');
      qc.invalidateQueries({ queryKey: ['plaid-items'] });
    },
    onError: () => toast('Sync failed', 'error'),
  });

  const syncAllMutation = useMutation({
    mutationFn: () => plaidApi.syncAll(),
    onSuccess: () => {
      toast('All banks synced', 'success');
      qc.invalidateQueries({ queryKey: ['plaid-items'] });
    },
    onError: () => toast('Sync failed', 'error'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => plaidApi.deleteItem(itemId),
    onSuccess: () => {
      toast('Bank disconnected', 'success');
      qc.invalidateQueries({ queryKey: ['plaid-items'] });
      setDeleteItemId(null);
    },
    onError: () => toast('Failed to disconnect bank', 'error'),
  });

  // Toggle account visibility
  const toggleHideMutation = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => plaidApi.updateAccount(id, { hidden }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plaid-items'] }),
    onError: () => toast('Failed to update account visibility', 'error'),
  });

  if (isLoading) return <PageSpinner />;

  const linkedItems = items ?? [];
  const totalAccounts = linkedItems.reduce((acc: number, item: { accounts: unknown[] }) => acc + (item.accounts?.length ?? 0), 0);

  // Sum up balances
  let totalAssets = 0;
  let totalLiabilities = 0;
  for (const item of linkedItems) {
    for (const acct of (item.accounts ?? []) as Array<{ type: string; current_balance: number | string | null; hidden: boolean }>) {
      if (acct.hidden) continue;
      const bal = parseFloat(String(acct.current_balance ?? 0));
      if (acct.type === 'credit' || acct.type === 'loan') {
        totalLiabilities += Math.abs(bal);
      } else {
        totalAssets += bal;
      }
    }
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Linked Banks
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {linkedItems.length} bank{linkedItems.length !== 1 ? 's' : ''} connected &middot; {totalAccounts} account{totalAccounts !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {linkedItems.length > 0 && (
            <Button
              variant="secondary"
              icon={<RefreshCw className="w-4 h-4" />}
              loading={syncAllMutation.isPending}
              onClick={() => syncAllMutation.mutate()}
            >
              Sync All
            </Button>
          )}
          {linkToken ? (
            <PlaidLinkButton linkToken={linkToken} onSuccess={handleLinkSuccess}>
              Connect Bank
            </PlaidLinkButton>
          ) : (
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              loading={isCreatingToken}
              onClick={handleAddBank}
            >
              Add Bank
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {linkedItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Total Assets</p>
                <p className="text-lg font-bold text-emerald-400">{fmt(totalAssets)}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Total Liabilities</p>
                <p className="text-lg font-bold text-red-400">{fmt(totalLiabilities)}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Net Balance</p>
                <p className={cn('text-lg font-bold', totalAssets - totalLiabilities >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {fmt(totalAssets - totalLiabilities)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {linkedItems.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'var(--gradient-primary)' }}>
            <Landmark className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Connect Your Banks
          </h2>
          <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>
            Securely link your bank accounts to automatically import transactions,
            track balances, and get insights. We support 12,000+ banks including
            Chase, Bank of America, Wells Fargo, Citi, Capital One, and more.
          </p>

          {/* Popular banks grid */}
          <div className="flex flex-wrap justify-center gap-3 mb-8 max-w-lg mx-auto">
            {[
              { name: 'Chase', color: '#117ACA' },
              { name: 'Bank of America', color: '#012169' },
              { name: 'Wells Fargo', color: '#D71E28' },
              { name: 'Citi', color: '#003B70' },
              { name: 'Capital One', color: '#004977' },
              { name: 'USAA', color: '#003B6F' },
              { name: 'US Bank', color: '#D81F26' },
              { name: 'PNC', color: '#FF6600' },
              { name: 'TD Bank', color: '#34A853' },
              { name: 'Schwab', color: '#00A0DF' },
              { name: 'Fidelity', color: '#4AA74F' },
              { name: 'Vanguard', color: '#8B1A10' },
            ].map(bank => (
              <span
                key={bank.name}
                className="text-xs font-medium px-3 py-1.5 rounded-full"
                style={{
                  background: bank.color + '15',
                  color: bank.color,
                  border: `1px solid ${bank.color}30`,
                }}
              >
                {bank.name}
              </span>
            ))}
            <span className="text-xs px-3 py-1.5 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              + 12,000 more
            </span>
          </div>

          {linkToken ? (
            <PlaidLinkButton linkToken={linkToken} onSuccess={handleLinkSuccess}>
              Connect Your First Bank
            </PlaidLinkButton>
          ) : (
            <Button
              variant="primary"
              size="lg"
              icon={<Plus className="w-5 h-5" />}
              loading={isCreatingToken}
              onClick={handleAddBank}
            >
              Connect Your First Bank
            </Button>
          )}

          <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
            <span className="inline-flex items-center gap-1">
              🔒 Bank-level encryption &middot; Read-only access &middot; Powered by Plaid
            </span>
          </p>
        </motion.div>
      )}

      {/* Bank Items */}
      <AnimatePresence mode="popLayout">
        {linkedItems.map((item: {
          id: string;
          item_id: string;
          institution_name: string;
          institution_id: string;
          institution_color: string | null;
          institution_logo: string | null;
          status: string;
          error_message: string | null;
          last_synced_at: string | null;
          created_at: string;
          accounts: Array<{
            id: string;
            account_id: string;
            name: string;
            official_name: string | null;
            type: string;
            subtype: string | null;
            mask: string | null;
            current_balance: number | string | null;
            available_balance: number | string | null;
            credit_limit: number | string | null;
            hidden: boolean;
          }>;
        }, i: number) => (
          <motion.div
            key={item.item_id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ delay: i * 0.05 }}
            layout
          >
            <Card className="overflow-hidden">
              {/* Item Header */}
              <div className="flex items-center justify-between p-5 pb-3">
                <div className="flex items-center gap-3">
                  {/* Institution icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{
                      background: item.institution_color
                        ? item.institution_color
                        : 'var(--gradient-primary)',
                    }}
                  >
                    {item.institution_logo ? (
                      <img
                        src={`data:image/png;base64,${item.institution_logo}`}
                        alt={item.institution_name}
                        className="w-6 h-6 rounded"
                      />
                    ) : (
                      item.institution_name?.[0]?.toUpperCase() ?? 'B'
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {item.institution_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusBadge status={item.status} />
                      {item.last_synced_at && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          Synced {fmtRelative(item.last_synced_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {item.status === 'login_required' && updateLinkToken && updateItemId === item.item_id ? (
                    <PlaidLinkButton
                      linkToken={updateLinkToken}
                      onSuccess={handleUpdateSuccess}
                      variant="secondary"
                    >
                      Reconnect
                    </PlaidLinkButton>
                  ) : item.status === 'login_required' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleReauth(item.item_id)}
                      icon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      Fix
                    </Button>
                  ) : null}

                  <Button
                    variant="ghost"
                    size="sm"
                    loading={syncMutation.isPending}
                    onClick={() => syncMutation.mutate(item.item_id)}
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteItemId(item.item_id)}
                    icon={<Trash2 className="w-3.5 h-3.5 text-red-400" />}
                  />
                </div>
              </div>

              {/* Error message */}
              {item.error_message && (
                <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.error_message}</span>
                </div>
              )}

              {/* Accounts */}
              <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                {item.accounts.map((acct, j) => {
                  const balance = parseFloat(String(acct.current_balance ?? 0));
                  const isDebt = acct.type === 'credit' || acct.type === 'loan';

                  return (
                    <motion.div
                      key={acct.account_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: acct.hidden ? 0.4 : 1 }}
                      className={cn(
                        'flex items-center justify-between px-5 py-3 transition-colors',
                        j < item.accounts.length - 1 && 'border-b'
                      )}
                      style={{
                        borderColor: 'var(--border)',
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-white',
                          accountGradient(acct.type),
                        )}>
                          <AccountIcon type={acct.type} subtype={acct.subtype ?? undefined} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {acct.name}
                            {acct.mask && <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>····{acct.mask}</span>}
                          </p>
                          <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>
                            {acct.subtype?.replace(/_/g, ' ') ?? acct.type}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'text-sm font-semibold tabular-nums',
                          isDebt ? 'text-red-400' : 'text-emerald-400'
                        )}>
                          {isDebt ? '-' : ''}{fmt(Math.abs(balance))}
                        </span>
                        <button
                          onClick={() => toggleHideMutation.mutate({ id: acct.id, hidden: !acct.hidden })}
                          className="p-1 rounded transition-colors"
                          style={{ color: 'var(--text-muted)' }}
                          title={acct.hidden ? 'Show account' : 'Hide account'}
                        >
                          {acct.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}

                {item.accounts.length === 0 && (
                  <div className="px-5 py-4 text-center">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      No accounts found. Try syncing.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Supported Banks Info */}
      {linkedItems.length > 0 && (
        <div className="text-center pt-4">
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="w-3.5 h-3.5" />}
            loading={isCreatingToken}
            onClick={linkToken ? undefined : handleAddBank}
          >
            Connect Another Bank
          </Button>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Supports 12,000+ institutions &middot; Powered by Plaid &middot; 🔒 Encrypted
          </p>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteItemId}
        title="Disconnect Bank"
        message="This will remove the bank connection and all synced transactions from this institution. This cannot be undone."
        confirmLabel="Disconnect"
        danger
        onConfirm={() => deleteItemId && deleteMutation.mutate(deleteItemId)}
        onClose={() => setDeleteItemId(null)}
      />
    </div>
  );
}
