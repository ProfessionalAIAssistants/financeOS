import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../../db/client';
import { config } from '../../config';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

// Lazy-init Stripe only when a secret key is configured
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.stripeSecretKey) {
      throw new Error('Stripe is not configured — set STRIPE_SECRET_KEY');
    }
    _stripe = new Stripe(config.stripeSecretKey);
  }
  return _stripe;
}

// ─── Plan definitions ────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: null,
    features: [
      'Unlimited transactions',
      'Bank sync (manual OFX)',
      'Budgets & alerts',
      'Basic AI categorisation',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9,
    interval: 'month',
    priceId: config.stripeProPriceId,
    features: [
      'Everything in Free',
      'Automated bank sync',
      'AI insights & forecasting',
      'Subscription detection',
      'Net worth snapshots',
      'Priority support',
    ],
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: 149,
    interval: 'once',
    priceId: config.stripeLifetimePriceId,
    features: [
      'Everything in Pro',
      'All future features',
      'One-time payment',
    ],
  },
];

// ─── GET /api/billing/plans ──────────────────────────────────────────────────

router.get('/plans', (_req: Request, res: Response) => {
  res.json(PLANS);
});

// ─── POST /api/billing/checkout ──────────────────────────────────────────────

router.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;
  const { planId } = req.body as { planId?: string };

  const plan = PLANS.find((p) => p.id === planId && p.priceId);
  if (!plan?.priceId) {
    res.status(400).json({ error: 'Invalid plan' });
    return;
  }

  if (!config.stripeSecretKey) {
    res.status(503).json({ error: 'Billing not configured on this server' });
    return;
  }

  try {
    const userRow = await query(
      'SELECT email, stripe_customer_id FROM app_users WHERE id = $1',
      [userId]
    );
    const user = userRow.rows[0];
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Find or create Stripe customer
    let customerId: string = user.stripe_customer_id;
    if (!customerId) {
      const customer = await getStripe().customers.create({ email: user.email });
      customerId = customer.id;
      await query(
        'UPDATE app_users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, userId]
      );
    }

    const isRecurring = plan.interval === 'month';
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: isRecurring ? 'subscription' : 'payment',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${config.appUrl}/billing?success=1`,
      cancel_url: `${config.appUrl}/billing?canceled=1`,
      metadata: { userId, planId: plan.id },
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Checkout error');
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ─── POST /api/billing/portal ────────────────────────────────────────────────

router.post('/portal', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).userId;

  if (!config.stripeSecretKey) {
    res.status(503).json({ error: 'Billing not configured on this server' });
    return;
  }

  try {
    const userRow = await query(
      'SELECT stripe_customer_id FROM app_users WHERE id = $1',
      [userId]
    );
    const customerId = userRow.rows[0]?.stripe_customer_id;
    if (!customerId) {
      res.status(400).json({ error: 'No billing account found — subscribe first' });
      return;
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.appUrl}/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Portal error');
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// ─── POST /api/billing/webhook ───────────────────────────────────────────────
// Must be mounted BEFORE the JSON body-parser middleware (needs raw body)

router.post(
  '/webhook',
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    if (!config.stripeWebhookSecret) {
      logger.warn('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
      res.status(400).json({ error: 'Webhook not configured' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(
        req.body as Buffer,
        sig,
        config.stripeWebhookSecret
      );
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Webhook signature error');
      res.status(400).send('Webhook signature verification failed');
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const { userId, planId } = session.metadata ?? {};
          if (!userId) break;

          if (session.mode === 'payment' && planId === 'lifetime') {
            await query(
              `UPDATE app_users
               SET plan = 'lifetime',
                   subscription_status = 'active',
                   stripe_customer_id = COALESCE(stripe_customer_id, $2)
               WHERE id = $1`,
              [userId, session.customer as string]
            );
          } else if (session.mode === 'subscription') {
            await query(
              `UPDATE app_users
               SET plan = 'pro',
                   subscription_status = 'active',
                   stripe_subscription_id = $2,
                   stripe_customer_id = COALESCE(stripe_customer_id, $3)
               WHERE id = $1`,
              [
                userId,
                session.subscription as string,
                session.customer as string,
              ]
            );
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const status = sub.status; // active | past_due | canceled | etc.
          await query(
            `UPDATE app_users
             SET subscription_status = $1,
                 plan = CASE WHEN $1 IN ('active','trialing') THEN 'pro' ELSE 'free' END
             WHERE stripe_subscription_id = $2`,
            [status, sub.id]
          );
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          await query(
            `UPDATE app_users
             SET plan = 'free',
                 subscription_status = 'canceled',
                 stripe_subscription_id = NULL,
                 canceled_at = NOW()
             WHERE stripe_subscription_id = $1`,
            [sub.id]
          );
          break;
        }

        default:
          break;
      }
      res.json({ received: true });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Webhook handler error');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

export default router;
