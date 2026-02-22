import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { assetsApi } from '../lib/api';

import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt, gradientForType } from '../lib/utils';
import { Plus, Home, Car, FileText, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

type AssetType = 'real_estate' | 'vehicle' | 'note' | 'other';

const typeIcon = { real_estate: Home, vehicle: Car, note: FileText, other: FileText };
const typeLabel = { real_estate: 'Real Estate', vehicle: 'Vehicle', note: 'Promissory Note', other: 'Other' };

interface Asset {
  id: string;
  asset_type: AssetType;
  name: string;
  current_value?: string;
  purchase_price?: string;
  address?: string;
  year?: number;
  make?: string;
  model?: string;
  principal?: string;
  interest_rate?: string;
  maturity_date?: string;
  created_at?: string;
}

interface NewAssetForm {
  asset_type: AssetType;
  name: string;
  purchase_price: string;
  current_value: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  principal: string;
  interest_rate: string;
  term_months: string;
  start_date: string;
  borrower_name: string;
  notes: string;
}

export function Assets() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<NewAssetForm>({
    asset_type: 'real_estate', name: '', purchase_price: '', current_value: '',
    address: '', city: '', state: '', zip: '', vin: '', year: '', make: '', model: '',
    principal: '', interest_rate: '', term_months: '', start_date: '', borrower_name: '', notes: '',
  });

  const { data: assets = [], isLoading } = useQuery(['assets'], assetsApi.list);

  const createMutation = useMutation({
    mutationFn: assetsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setAddOpen(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => assetsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });

  const totalValue = assets.reduce((s: number, a: Asset) => s + parseFloat(a.current_value ?? '0'), 0);

  function handleCreate() {
    const payload: Record<string, unknown> = {
      assetType: form.asset_type,
      name: form.name,
      purchasePrice: form.purchase_price || undefined,
      currentValue: form.current_value || undefined,
      notes: form.notes || undefined,
    };
    if (form.asset_type === 'real_estate') {
      payload.address = form.address;
      payload.city = form.city;
      payload.state = form.state;
      payload.zip = form.zip;
    } else if (form.asset_type === 'vehicle') {
      payload.vin = form.vin;
      payload.year = form.year ? parseInt(form.year) : undefined;
      payload.make = form.make;
      payload.model = form.model;
    } else if (form.asset_type === 'note') {
      payload.principal = form.principal;
      payload.interestRate = form.interest_rate;
      payload.termMonths = form.term_months ? parseInt(form.term_months) : undefined;
      payload.startDate = form.start_date;
      payload.borrowerName = form.borrower_name;
    }
    createMutation.mutate(payload);
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(totalValue)}</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{assets.length} assets tracked</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Add Asset</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {assets.map((a: Asset, i: number) => {
          const Icon = typeIcon[a.asset_type] ?? FileText;
          const grad = gradientForType(a.asset_type);
          return (
            <motion.div key={a.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{a.name}</p>
                    <Badge variant="info">{typeLabel[a.asset_type]}</Badge>
                  </div>
                </div>
                <button onClick={() => deleteMutation.mutate(a.id)} className="p-1.5 transition-colors hover:text-red-400" style={{ color: 'var(--text-muted)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {a.address && <p className="truncate">{a.address}</p>}
                {a.year && <p>{a.year} {a.make} {a.model}</p>}
                {a.principal && <p>Principal: {fmt(a.principal)}</p>}
              </div>

              <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-input)' }}>
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Current Value</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{fmt(a.current_value ?? 0)}</p>
                </div>
                {a.purchase_price && (
                  <div className="text-right">
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Purchase</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{fmt(a.purchase_price)}</p>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {assets.length === 0 && (
          <div className="col-span-full glass p-12 text-center" style={{ color: 'var(--text-muted)' }}>
            <Home className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-base font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No assets added yet</p>
            <p className="text-sm">Add your home, vehicles, or real estate notes to include them in your net worth.</p>
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Asset" size="lg">
        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Asset Type</label>
            <div className="grid grid-cols-4 gap-2">
              {(['real_estate', 'vehicle', 'note', 'other'] as AssetType[]).map(t => (
                <button key={t}
                  onClick={() => setForm(f => ({ ...f, asset_type: t }))}
                  className="py-2 rounded-lg text-xs font-medium transition-all"
                  style={form.asset_type === t
                    ? { background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)', color: '#93c5fd' }
                    : { background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-muted)' }
                  }>
                  {typeLabel[t]}
                </button>
              ))}
            </div>
          </div>

          <input placeholder="Asset name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />

          {form.asset_type === 'real_estate' && (
            <>
              <input placeholder="Street address *" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
                <input placeholder="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
                <input placeholder="ZIP" value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Property value will be auto-fetched from Homesage.ai</p>
            </>
          )}

          {form.asset_type === 'vehicle' && (
            <>
              <input placeholder="VIN (auto-decodes year/make/model)" value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Year" type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
                <input placeholder="Make" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
                <input placeholder="Model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
              </div>
              <input placeholder="Purchase price" type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            </>
          )}

          {form.asset_type === 'note' && (
            <>
              <input placeholder="Borrower name" value={form.borrower_name} onChange={e => setForm(f => ({ ...f, borrower_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Principal ($)" type="number" value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
                <input placeholder="Rate (%)" type="number" step="0.01" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
                <input placeholder="Term (mo)" type="number" value={form.term_months} onChange={e => setForm(f => ({ ...f, term_months: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
              </div>
              <input placeholder="Start date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            </>
          )}

          {form.asset_type === 'other' && (
            <input placeholder="Current value ($)" type="number" value={form.current_value} onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
          )}
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button loading={createMutation.isPending} onClick={handleCreate} disabled={!form.name}>
            Add Asset
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
