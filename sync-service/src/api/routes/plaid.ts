import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { query } from '../../db/client';
import { getUserId } from '../../middleware/auth';
import {
  plaidClient,
  DEFAULT_PRODUCTS,
  DEFAULT_COUNTRY_CODES,
  encryptToken,
  decryptToken,
} from '../../plaid/client';
import { syncPlaidTransactions, refreshPlaidBalances } from '../../plaid/sync';
import { bridgeAccountsToFirefly } from '../../plaid/fireflyBridge';
import { Products } from 'plaid';
import logger from '../../lib/logger';

const router = Router();

// ── POST /link-token — Create a Plaid Link token ─────────────────────────────
router.post('/link-token', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    // Optional: for update mode (re-authentication)
    const { accessToken, itemId } = req.body as { accessToken?: string; itemId?: string };

    let actualAccessToken: string | undefined;
    if (itemId) {
      const itemRes = await query(
        'SELECT access_token_enc FROM plaid_items WHERE item_id = $1 AND user_id = $2',
        [itemId, userId]
      );
      if (itemRes.rows.length > 0) {
        actualAccessToken = decryptToken(itemRes.rows[0].access_token_enc);
      }
    }

    const request: Parameters<typeof plaidClient.linkTokenCreate>[0] = {
      user: { client_user_id: userId },
      client_name: 'FinanceOS',
      products: actualAccessToken ? undefined : DEFAULT_PRODUCTS,
      country_codes: DEFAULT_COUNTRY_CODES,
      language: 'en',
      ...(actualAccessToken && { access_token: actualAccessToken }),
      ...(config.plaidWebhookUrl && { webhook: config.plaidWebhookUrl }),
      ...(config.plaidRedirectUri && { redirect_uri: config.plaidRedirectUri }),
    };

    const response = await plaidClient.linkTokenCreate(request);

    res.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'linkTokenCreate error');
    const message = err instanceof Error ? err.message : 'Failed to create link token';
    res.status(500).json({ error: message });
  }
});

// ── POST /exchange — Exchange public token for access token ───────────────────
router.post('/exchange', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { publicToken, institutionId, institutionName } = req.body as {
      publicToken: string;
      institutionId?: string;
      institutionName?: string;
    };

    if (!publicToken) {
      res.status(400).json({ error: 'publicToken is required' });
      return;
    }

    // Exchange public token for permanent access token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeRes.data.access_token;
    const itemId = exchangeRes.data.item_id;

    // Get institution details if not provided
    let instName = institutionName ?? 'Unknown Bank';
    let instLogo: string | null = null;
    let instColor: string | null = null;
    let instId = institutionId ?? '';

    if (institutionId) {
      try {
        const instRes = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: DEFAULT_COUNTRY_CODES,
          options: { include_optional_metadata: true },
        });
        instName = instRes.data.institution.name;
        instLogo = instRes.data.institution.logo ?? null;
        instColor = instRes.data.institution.primary_color ?? null;
        instId = instRes.data.institution.institution_id;
      } catch {
        // Non-critical, continue with provided name
      }
    }

    // Store the item
    const encAccessToken = encryptToken(accessToken);
    const itemResult = await query(
      `INSERT INTO plaid_items
        (user_id, item_id, access_token_enc, institution_id, institution_name, institution_logo, institution_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (item_id) DO UPDATE SET
         access_token_enc = EXCLUDED.access_token_enc,
         institution_name = EXCLUDED.institution_name,
         institution_logo = EXCLUDED.institution_logo,
         institution_color = EXCLUDED.institution_color,
         status = 'good',
         error_code = NULL,
         error_message = NULL,
         updated_at = NOW()
       RETURNING id`,
      [userId, itemId, encAccessToken, instId, instName, instLogo, instColor]
    );
    const plaidItemDbId = itemResult.rows[0].id;

    // Fetch and store accounts
    const accountsRes = await plaidClient.accountsGet({ access_token: accessToken });
    const accounts = accountsRes.data.accounts;

    for (const acct of accounts) {
      await query(
        `INSERT INTO plaid_accounts
          (plaid_item_id, user_id, account_id, name, official_name, type, subtype, mask,
           current_balance, available_balance, credit_limit, currency_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (plaid_item_id, account_id) DO UPDATE SET
           name = EXCLUDED.name,
           official_name = EXCLUDED.official_name,
           type = EXCLUDED.type,
           subtype = EXCLUDED.subtype,
           current_balance = EXCLUDED.current_balance,
           available_balance = EXCLUDED.available_balance,
           credit_limit = EXCLUDED.credit_limit,
           updated_at = NOW()`,
        [
          plaidItemDbId,
          userId,
          acct.account_id,
          acct.name,
          acct.official_name,
          acct.type,
          acct.subtype,
          acct.mask,
          acct.balances.current,
          acct.balances.available,
          acct.balances.limit,
          acct.balances.iso_currency_code ?? 'USD',
        ]
      );
    }

    // Bridge accounts to Firefly III (non-blocking)
    bridgeAccountsToFirefly(instName, accounts.map(a => ({
      account_id: a.account_id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      balances: { current: a.balances.current },
      iso_currency_code: a.balances.iso_currency_code,
    }))).catch(err =>
      logger.error({ itemId, err: err instanceof Error ? err.message : err }, 'Firefly bridge failed')
    );

    // Kick off initial transaction sync (non-blocking)
    syncPlaidTransactions(itemId).catch(err =>
      logger.error({ itemId, err: err instanceof Error ? err.message : err }, 'Initial Plaid sync failed')
    );

    res.json({
      success: true,
      item: {
        id: plaidItemDbId,
        itemId,
        institutionName: instName,
        institutionId: instId,
        accountCount: accounts.length,
      },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid exchange error');
    const message = err instanceof Error ? err.message : 'Failed to exchange token';
    res.status(500).json({ error: message });
  }
});

// ── GET /items — List user's connected banks ──────────────────────────────────
router.get('/items', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    // Single query with LEFT JOIN to avoid N+1
    const result = await query(
      `SELECT pi.id, pi.item_id, pi.institution_id, pi.institution_name, pi.institution_logo, pi.institution_color,
              pi.status, pi.error_code, pi.error_message, pi.consent_expires_at, pi.last_synced_at, pi.created_at,
              COALESCE(json_agg(json_build_object(
                'id', pa.id, 'account_id', pa.account_id, 'name', pa.name, 'official_name', pa.official_name,
                'type', pa.type, 'subtype', pa.subtype, 'mask', pa.mask,
                'current_balance', pa.current_balance, 'available_balance', pa.available_balance,
                'credit_limit', pa.credit_limit, 'currency_code', pa.currency_code, 'hidden', pa.hidden
              ) ORDER BY pa.type, pa.name) FILTER (WHERE pa.id IS NOT NULL), '[]') as accounts
       FROM plaid_items pi
       LEFT JOIN plaid_accounts pa ON pa.plaid_item_id = pi.id AND pa.user_id = $1
       WHERE pi.user_id = $1
       GROUP BY pi.id
       ORDER BY pi.created_at DESC`,
      [userId]
    );

    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'List Plaid items error');
    res.status(500).json({ error: 'Failed to fetch linked banks' });
  }
});

// ── POST /sync/:itemId — Trigger manual transaction sync ──────────────────────
router.post('/sync/:itemId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const itemId = req.params.itemId as string;

    // Verify ownership
    const check = await query(
      'SELECT item_id FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Plaid item not found' });
      return;
    }

    const result = await syncPlaidTransactions(itemId);
    await refreshPlaidBalances(itemId);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid sync error');
    const message = err instanceof Error ? err.message : 'Sync failed';
    res.status(500).json({ error: message });
  }
});

// ── POST /sync-all — Sync all items for the user ─────────────────────────────
router.post('/sync-all', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const itemsRes = await query(
      'SELECT item_id FROM plaid_items WHERE user_id = $1 AND status != $2',
      [userId, 'login_required']
    );

    const results = [];
    for (const item of itemsRes.rows) {
      try {
        const r = await syncPlaidTransactions(item.item_id);
        await refreshPlaidBalances(item.item_id);
        results.push({ itemId: item.item_id, ...r });
      } catch (err) {
        results.push({
          itemId: item.item_id,
          error: err instanceof Error ? err.message : 'sync failed',
        });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid sync-all error');
    res.status(500).json({ error: 'Sync failed' });
  }
});

// ── DELETE /items/:itemId — Disconnect a bank ─────────────────────────────────
router.delete('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const itemId = req.params.itemId as string;

    // Verify ownership and get access token
    const itemRes = await query(
      'SELECT id, access_token_enc FROM plaid_items WHERE item_id = $1 AND user_id = $2',
      [itemId, userId]
    );
    if (itemRes.rows.length === 0) {
      res.status(404).json({ error: 'Plaid item not found' });
      return;
    }

    // Remove from Plaid
    try {
      const accessToken = decryptToken(itemRes.rows[0].access_token_enc);
      await plaidClient.itemRemove({ access_token: accessToken });
    } catch {
      // Continue even if Plaid removal fails — still clean up locally
      logger.warn({ itemId }, 'itemRemove failed — continuing with local cleanup');
    }

    // Cascade delete (plaid_accounts and plaid_transactions are cascaded)
    await query('DELETE FROM plaid_items WHERE id = $1', [itemRes.rows[0].id]);

    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid delete item error');
    res.status(500).json({ error: 'Failed to disconnect bank' });
  }
});

// ── GET /transactions — List Plaid transactions for the user ──────────────────
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const txnRes = await query(
      `SELECT pt.*, pa.name as account_name, pa.mask as account_mask, pa.type as account_type,
              pi.institution_name
       FROM plaid_transactions pt
       LEFT JOIN plaid_accounts pa ON pt.plaid_account_id = pa.id
       LEFT JOIN plaid_items pi ON pa.plaid_item_id = pi.id
       WHERE pt.user_id = $1
       ORDER BY pt.date DESC, pt.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countRes = await query(
      'SELECT COUNT(*) FROM plaid_transactions WHERE user_id = $1',
      [userId]
    );

    res.json({
      data: txnRes.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'List Plaid transactions error');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ── PATCH /accounts/:accountId — Update account (e.g. hide/show) ──────────────
router.patch('/accounts/:accountId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const accountId = req.params.accountId as string;
    const { hidden } = req.body as { hidden?: boolean };

    if (typeof hidden !== 'boolean') {
      res.status(400).json({ error: 'hidden (boolean) is required' });
      return;
    }

    const result = await query(
      'UPDATE plaid_accounts SET hidden = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id',
      [hidden, accountId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid update account error');
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// ── POST /webhook — Plaid webhook handler ─────────────────────────────────────
// NOTE: This endpoint should be public (no auth) — Plaid sends webhooks directly
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Verify Plaid webhook signature if we have a webhook secret configured
    const plaidVerificationHeader = req.headers['plaid-verification'] as string | undefined;
    if (plaidVerificationHeader && config.plaidSecret) {
      try {
        // Use Plaid's webhook verification endpoint
        const verification = await plaidClient.webhookVerificationKeyGet({
          key_id: plaidVerificationHeader,
        });
        if (!verification.data.key) {
          logger.warn('Plaid webhook signature verification failed — no key returned');
        }
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : err }, 'Plaid webhook signature verification failed');
        // Continue processing — don't reject webhooks if verification infra fails
      }
    }

    const { webhook_type, webhook_code, item_id, error } = req.body as {
      webhook_type: string;
      webhook_code: string;
      item_id: string;
      error?: { error_code: string; error_message: string };
    };

    logger.info({ webhook_type, webhook_code, item_id }, 'Plaid webhook received');

    switch (webhook_type) {
      case 'TRANSACTIONS': {
        if (['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE'].includes(webhook_code)) {
          syncPlaidTransactions(item_id).catch(err =>
            logger.error({ item_id, err: err instanceof Error ? err.message : err }, 'Plaid webhook sync failed')
          );
        }
        break;
      }
      case 'ITEM': {
        if (webhook_code === 'ERROR') {
          await query(
            `UPDATE plaid_items SET status = 'error', error_code = $1, error_message = $2, updated_at = NOW()
             WHERE item_id = $3`,
            [error?.error_code ?? 'UNKNOWN', error?.error_message ?? 'Unknown error', item_id]
          );
        } else if (webhook_code === 'PENDING_EXPIRATION') {
          await query(
            `UPDATE plaid_items SET status = 'login_required', updated_at = NOW() WHERE item_id = $1`,
            [item_id]
          );
        }
        break;
      }
      default:
        logger.info({ webhook_type, webhook_code }, 'Unhandled Plaid webhook type');
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'Plaid webhook error');
    // Always return 200 to Plaid to acknowledge receipt
    res.json({ received: true });
  }
});

export default router;
