import { useState } from 'react';
import { Check, Loader2, Star, Zap, Infinity } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQuery } from '../hooks/useQuery';
import { billingApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { useSearchParams } from 'react-router-dom';

interface Plan {
  id: string;
  name: string;
  price: number;
  interval: string | null;
  priceId?: string;
  features: string[];
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Star className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />,
  pro: <Zap className="w-6 h-6" style={{ color: 'var(--accent)' }} />,
  lifetime: <Infinity className="w-6 h-6" style={{ color: 'var(--warning)' }} />,
};

const PLAN_BORDERS: Record<string, React.CSSProperties> = {
  free: { borderColor: 'var(--border-strong)' },
  pro: { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-subtle)' },
  lifetime: { borderColor: 'var(--warning)', boxShadow: '0 0 0 2px var(--warning-subtle)' },
};

export function Billing() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const toast = useToast();

  const { data: plans = [], isLoading } = useQuery<Plan[]>(['billing-plans'], billingApi.plans);

  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');

  async function handleSubscribe(planId: string) {
    setLoading(planId);
    try {
      const { url } = await billingApi.checkout(planId);
      if (url) window.location.href = url;
    } catch {
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading('portal');
    try {
      const { url } = await billingApi.portal();
      if (url) window.location.href = url;
    } catch {
      toast.error('Could not open billing portal. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  if (isLoading) return <PageSpinner />;

  const currentPlan = user?.plan ?? 'free';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Plans & Billing</h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          You are currently on the{' '}
          <span className="font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
            {currentPlan}
          </span>{' '}
          plan.
        </p>
      </div>

      {/* Success / canceled banners */}
      {success && (
        <div
          className="mb-6 p-4 rounded-xl text-sm"
          style={{ background: 'var(--success-subtle)', border: '1px solid var(--success)', color: 'var(--success)' }}
        >
          🎉 Subscription activated! Your plan has been upgraded.
        </div>
      )}
      {canceled && (
        <div
          className="mb-6 p-4 rounded-xl text-sm"
          style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', color: 'var(--warning)' }}
        >
          Checkout was canceled — no changes were made.
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {plans.map((plan, i) => {
          const isCurrentPlan = plan.id === currentPlan;
          const isPopular = plan.id === 'pro';

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="relative rounded-2xl border p-6 flex flex-col"
              style={{
                background: 'var(--bg-elevated)',
                ...(PLAN_BORDERS[plan.id] ?? PLAN_BORDERS.free),
              }}
            >
              {isPopular && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-xs font-bold rounded-full"
                  style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}
                >
                  MOST POPULAR
                </span>
              )}

              <div className="flex items-center gap-3 mb-4">
                {PLAN_ICONS[plan.id]}
                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{plan.name}</h2>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-extrabold" style={{ color: 'var(--text-primary)' }}>
                  ${plan.price}
                </span>
                {plan.interval && (
                  <span className="ml-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    /{plan.interval}
                  </span>
                )}
                {plan.id === 'lifetime' && (
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--warning)' }}>
                    one-time payment
                  </span>
                )}
              </div>

              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <Check className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? (
                <div
                  className="py-2.5 text-center text-sm font-semibold rounded-lg"
                  style={{ color: 'var(--accent)', border: '1px solid var(--accent-subtle)' }}
                >
                  ✓ Current Plan
                </div>
              ) : plan.id === 'free' ? (
                <div
                  className="py-2.5 text-center text-sm rounded-lg"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border-strong)' }}
                >
                  Downgrade via billing portal
                </div>
              ) : (
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={loading === plan.id}
                  className="py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{
                    background: plan.id === 'lifetime' ? 'var(--warning)' : 'var(--accent)',
                    color: 'var(--text-on-accent)',
                  }}
                >
                  {loading === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {plan.id === 'lifetime' ? 'Buy Once' : 'Subscribe'}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Manage billing */}
      {(currentPlan === 'pro') && (
        <Card>
          <CardHeader>
            <CardTitle>Manage Subscription</CardTitle>
          </CardHeader>
          <div className="px-6 pb-6">
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Update your payment method, download invoices, or cancel your subscription via the Stripe billing portal.
            </p>
            <button
              onClick={handlePortal}
              disabled={loading === 'portal'}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-60"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
            >
              {loading === 'portal' && <Loader2 className="w-4 h-4 animate-spin" />}
              Open Billing Portal
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
