/**
 * Plaid → Firefly III Bridge
 *
 * Automatically mirrors Plaid accounts, transactions, and balances into Firefly
 * so that Budgets, Tags, Categories, Insights, and all existing pages work
 * seamlessly with Plaid-sourced data.
 */
import {
  createAccount,
  getAccounts,
  createTransaction,
  updateAccountBalance,
  isHealthy,
} from '../firefly/client';
import { query } from '../db/client';
import type { Transaction as PlaidTransaction } from 'plaid';
import logger from '../lib/logger';

// ── In-memory cache: plaid_account_id → firefly_account_id ────────────────────
const ffAccountCache: Record<string, string> = {};

/**
 * Check if Firefly is reachable. If not, skip bridging silently.
 */
async function fireflyAvailable(): Promise<boolean> {
  try {
    return await isHealthy();
  } catch {
    return false;
  }
}

// ── Account bridging ──────────────────────────────────────────────────────────

/**
 * Ensure a Firefly account exists for a Plaid account.
 * Returns the Firefly account ID (string).
 */
export async function ensureFireflyAccount(
  plaidAccountId: string,
  institutionName: string,
  accountName: string,
  accountType: string,
  accountSubtype: string | null,
  balance: number | null,
  currency = 'USD',
): Promise<string | null> {
  if (!await fireflyAvailable()) return null;

  // Check cache
  if (ffAccountCache[plaidAccountId]) return ffAccountCache[plaidAccountId];

  // Check DB mapping
  try {
    const mapRes = await query(
      'SELECT firefly_account_id FROM plaid_firefly_map WHERE plaid_account_id = $1',
      [plaidAccountId]
    );
    if (mapRes.rows.length > 0) {
      ffAccountCache[plaidAccountId] = mapRes.rows[0].firefly_account_id;
      return mapRes.rows[0].firefly_account_id;
    }
  } catch {
    // Table might not exist yet — will be created by migration
  }

  // Search Firefly for existing account with display name
  const displayName = `[${institutionName.toUpperCase()}] ${accountName}`;
  try {
    const existing = await getAccounts('all');
    const found = existing.find((a: { attributes: { name: string } }) =>
      a.attributes.name === displayName
    );
    if (found) {
      const id = String(found.id);
      ffAccountCache[plaidAccountId] = id;
      await saveAccountMapping(plaidAccountId, id);
      return id;
    }
  } catch {
    // Firefly search failed, try creating
  }

  // Map Plaid account types to Firefly types
  const ffType = (accountType === 'credit' || accountType === 'loan') ? 'liabilities' : 'asset';
  const ffRole = accountType === 'credit' ? 'ccAsset'
    : accountType === 'investment' ? 'savingAsset'
    : accountSubtype === 'savings' ? 'savingAsset'
    : 'defaultAsset';

  try {
    const created = await createAccount({
      name: displayName,
      type: ffType === 'liabilities' ? 'liability' : 'asset',
      account_role: ffRole,
      currency_code: currency,
      current_balance: balance ?? 0,
      current_balance_date: new Date().toISOString().split('T')[0],
      notes: `Auto-created from Plaid (${institutionName})`,
    });
    const newId = String(created.id);
    ffAccountCache[plaidAccountId] = newId;
    await saveAccountMapping(plaidAccountId, newId);
    logger.info({ displayName, fireflyId: newId }, 'Created Firefly account from Plaid');
    return newId;
  } catch (err) {
    logger.error({ displayName, err: err instanceof Error ? err.message : err }, 'Failed to create Firefly account');
    return null;
  }
}

async function saveAccountMapping(plaidAccountId: string, fireflyAccountId: string): Promise<void> {
  try {
    await query(
      `INSERT INTO plaid_firefly_map (plaid_account_id, firefly_account_id)
       VALUES ($1, $2)
       ON CONFLICT (plaid_account_id) DO UPDATE SET firefly_account_id = EXCLUDED.firefly_account_id`,
      [plaidAccountId, fireflyAccountId]
    );
  } catch {
    // Ignore — mapping table might not exist yet
  }
}

// ── Transaction bridging ──────────────────────────────────────────────────────

/**
 * Push an array of Plaid transactions into Firefly.
 * Skips pending transactions and ones already imported.
 */
export async function pushTransactionsToFirefly(
  transactions: PlaidTransaction[],
  institutionName: string,
): Promise<{ pushed: number; skipped: number }> {
  if (!await fireflyAvailable()) return { pushed: 0, skipped: 0 };

  let pushed = 0;
  let skipped = 0;

  for (const txn of transactions) {
    // Skip pending transactions — they change and would create duplicates
    if (txn.pending) {
      skipped++;
      continue;
    }

    const externalId = `plaid-${txn.transaction_id}`;

    // Check if already imported
    try {
      const existing = await query(
        'SELECT id FROM imported_transactions WHERE external_id = $1 AND institution_name = $2',
        [externalId, institutionName]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }
    } catch {
      // imported_transactions table might not exist, continue
    }

    // Get the Firefly account ID for this Plaid account
    const fireflyAccountId = ffAccountCache[txn.account_id]
      ?? await getFireflyAccountForPlaidAccount(txn.account_id);

    if (!fireflyAccountId) {
      skipped++;
      continue;
    }

    // In Plaid: positive = money leaving account (debit), negative = money entering (credit)
    const amount = txn.amount;
    const absAmount = Math.abs(amount);
    const txType = amount > 0 ? 'withdrawal' : 'deposit';
    const description = txn.merchant_name ?? txn.name ?? 'Unknown';

    // Build category tag from Plaid's personal finance category
    const category = txn.personal_finance_category?.primary?.replace(/_/g, ' ') ?? undefined;

    try {
      const ffData: Record<string, unknown> = {
        type: txType,
        date: txn.date,
        amount: absAmount.toFixed(2),
        description,
        notes: [
          txn.name !== description ? txn.name : '',
          txn.payment_channel ? `Channel: ${txn.payment_channel}` : '',
        ].filter(Boolean).join(' | ') || undefined,
        external_id: externalId,
        category_name: category,
      };

      if (txType === 'withdrawal') {
        ffData.source_id = fireflyAccountId;
        ffData.destination_name = description;
      } else {
        ffData.destination_id = fireflyAccountId;
        ffData.source_name = description;
      }

      const created = await createTransaction(ffData);
      const createdId = String(created?.id ?? '');

      // Mark as imported to prevent duplicates
      try {
        await query(
          `INSERT INTO imported_transactions (external_id, institution_name, firefly_transaction_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [externalId, institutionName, createdId]
        );
      } catch {
        // Ignore
      }

      pushed++;
    } catch (err) {
      if (err instanceof Error && err.message?.includes('duplicate')) {
        skipped++;
      } else {
        logger.error({ txnId: txn.transaction_id, err: err instanceof Error ? err.message : err }, 'Failed to push txn to Firefly');
        skipped++;
      }
    }
  }

  if (pushed > 0) {
    logger.info({ pushed, skipped }, 'Pushed transactions to Firefly');
  }

  return { pushed, skipped };
}

/**
 * Look up the Firefly account ID for a Plaid account_id.
 */
async function getFireflyAccountForPlaidAccount(plaidAccountId: string): Promise<string | null> {
  if (ffAccountCache[plaidAccountId]) return ffAccountCache[plaidAccountId];

  try {
    const mapRes = await query(
      'SELECT firefly_account_id FROM plaid_firefly_map WHERE plaid_account_id = $1',
      [plaidAccountId]
    );
    if (mapRes.rows.length > 0) {
      ffAccountCache[plaidAccountId] = mapRes.rows[0].firefly_account_id;
      return mapRes.rows[0].firefly_account_id;
    }
  } catch {
    // Ignore
  }
  return null;
}

// ── Balance bridging ──────────────────────────────────────────────────────────

/**
 * Update Firefly account balances from Plaid balance data.
 */
export async function syncBalancesToFirefly(
  accounts: Array<{
    account_id: string;
    balances: { current: number | null };
  }>,
): Promise<void> {
  if (!await fireflyAvailable()) return;

  const today = new Date().toISOString().split('T')[0];

  for (const acct of accounts) {
    const fireflyId = ffAccountCache[acct.account_id]
      ?? await getFireflyAccountForPlaidAccount(acct.account_id);

    if (!fireflyId || acct.balances.current == null) continue;

    try {
      await updateAccountBalance(fireflyId, acct.balances.current, today);
    } catch (err) {
      logger.error({ accountId: acct.account_id, err: err instanceof Error ? err.message : err }, 'Failed to update Firefly balance');
    }
  }
}

// ── Bulk account setup (called on initial bank link) ──────────────────────────

/**
 * Create Firefly accounts for all accounts in a newly linked Plaid item.
 */
export async function bridgeAccountsToFirefly(
  institutionName: string,
  accounts: Array<{
    account_id: string;
    name: string;
    type: string;
    subtype: string | null;
    balances: { current: number | null };
    iso_currency_code: string | null;
  }>,
): Promise<void> {
  if (!await fireflyAvailable()) return;

  for (const acct of accounts) {
    await ensureFireflyAccount(
      acct.account_id,
      institutionName,
      acct.name,
      acct.type,
      acct.subtype,
      acct.balances.current,
      acct.iso_currency_code ?? 'USD',
    );
  }

  logger.info({ count: accounts.length, institutionName }, 'Bridged Plaid accounts to Firefly');
}
