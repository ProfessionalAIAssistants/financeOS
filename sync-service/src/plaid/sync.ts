import { plaidClient, decryptToken } from './client';
import { query, transaction } from '../db/client';
import { RemovedTransaction, Transaction } from 'plaid';
import { pushTransactionsToFirefly, syncBalancesToFirefly } from './fireflyBridge';
import logger from '../lib/logger';

/**
 * Sync transactions for a single Plaid item using the transactions/sync endpoint.
 * Uses a cursor for incremental updates — only fetches new/modified/removed transactions.
 */
export async function syncPlaidTransactions(itemId: string): Promise<{
  added: number;
  modified: number;
  removed: number;
}> {
  // Get item details
  const itemRes = await query(
    'SELECT id, user_id, access_token_enc, cursor FROM plaid_items WHERE item_id = $1',
    [itemId]
  );
  if (itemRes.rows.length === 0) throw new Error(`Plaid item not found: ${itemId}`);

  const item = itemRes.rows[0];
  const accessToken = decryptToken(item.access_token_enc);
  let cursor: string | undefined = item.cursor || undefined;
  let hasMore = true;

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  const allAdded: Transaction[] = [];
  const allModified: Transaction[] = [];
  const allRemoved: RemovedTransaction[] = [];

  // Paginate through all updates
  while (hasMore) {
    const res = await plaidClient.transactionsSync({
      access_token: accessToken,
      cursor: cursor,
      count: 500,
    });

    allAdded.push(...res.data.added);
    allModified.push(...res.data.modified);
    allRemoved.push(...res.data.removed);

    hasMore = res.data.has_more;
    cursor = res.data.next_cursor;
  }

  // Use a transaction to apply all changes atomically
  await transaction(async (client) => {
    // Process added transactions
    for (const txn of allAdded) {
      // Look up plaid_account_id
      const acctRes = await client.query(
        'SELECT id FROM plaid_accounts WHERE account_id = $1 AND plaid_item_id = $2',
        [txn.account_id, item.id]
      );
      const plaidAccountId = acctRes.rows[0]?.id ?? null;

      await client.query(
        `INSERT INTO plaid_transactions
          (user_id, plaid_account_id, transaction_id, account_id_plaid, amount, currency_code,
           name, merchant_name, category, primary_category, detailed_category,
           pending, date, authorized_date, payment_channel, logo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (transaction_id) DO UPDATE SET
           amount = EXCLUDED.amount,
           name = EXCLUDED.name,
           merchant_name = EXCLUDED.merchant_name,
           primary_category = EXCLUDED.primary_category,
           detailed_category = EXCLUDED.detailed_category,
           pending = EXCLUDED.pending,
           date = EXCLUDED.date`,
        [
          item.user_id,
          plaidAccountId,
          txn.transaction_id,
          txn.account_id,
          txn.amount,
          txn.iso_currency_code ?? 'USD',
          txn.name,
          txn.merchant_name,
          txn.category ?? [],
          txn.personal_finance_category?.primary ?? null,
          txn.personal_finance_category?.detailed ?? null,
          txn.pending,
          txn.date,
          txn.authorized_date,
          txn.payment_channel,
          txn.logo_url ?? null,
        ]
      );
      totalAdded++;
    }

    // Process modified transactions (same upsert)
    for (const txn of allModified) {
      const acctRes = await client.query(
        'SELECT id FROM plaid_accounts WHERE account_id = $1 AND plaid_item_id = $2',
        [txn.account_id, item.id]
      );
      const plaidAccountId = acctRes.rows[0]?.id ?? null;

      await client.query(
        `INSERT INTO plaid_transactions
          (user_id, plaid_account_id, transaction_id, account_id_plaid, amount, currency_code,
           name, merchant_name, category, primary_category, detailed_category,
           pending, date, authorized_date, payment_channel, logo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (transaction_id) DO UPDATE SET
           amount = EXCLUDED.amount,
           name = EXCLUDED.name,
           merchant_name = EXCLUDED.merchant_name,
           primary_category = EXCLUDED.primary_category,
           detailed_category = EXCLUDED.detailed_category,
           pending = EXCLUDED.pending,
           date = EXCLUDED.date`,
        [
          item.user_id,
          plaidAccountId,
          txn.transaction_id,
          txn.account_id,
          txn.amount,
          txn.iso_currency_code ?? 'USD',
          txn.name,
          txn.merchant_name,
          txn.category ?? [],
          txn.personal_finance_category?.primary ?? null,
          txn.personal_finance_category?.detailed ?? null,
          txn.pending,
          txn.date,
          txn.authorized_date,
          txn.payment_channel,
          txn.logo_url ?? null,
        ]
      );
      totalModified++;
    }

    // Process removed transactions
    for (const txn of allRemoved) {
      if (txn.transaction_id) {
        await client.query(
          'DELETE FROM plaid_transactions WHERE transaction_id = $1 AND user_id = $2',
          [txn.transaction_id, item.user_id]
        );
        totalRemoved++;
      }
    }

    // Update cursor and timestamps
    await client.query(
      'UPDATE plaid_items SET cursor = $1, last_synced_at = NOW(), updated_at = NOW(), status = $2, error_code = NULL, error_message = NULL WHERE id = $3',
      [cursor, 'good', item.id]
    );
  });

  // Bridge new/modified transactions to Firefly III (non-blocking, best-effort)
  if (allAdded.length > 0 || allModified.length > 0) {
    const institutionRes = await query(
      'SELECT institution_name FROM plaid_items WHERE id = $1',
      [item.id]
    );
    const instName = institutionRes.rows[0]?.institution_name ?? 'Unknown';
    const allTxns = [...allAdded, ...allModified];
    pushTransactionsToFirefly(allTxns, instName).catch(err =>
      logger.error({ err: err instanceof Error ? err.message : err }, 'PlaidSync Firefly bridge error')
    );
  }

  return { added: totalAdded, modified: totalModified, removed: totalRemoved };
}

/**
 * Refresh account balances for a single Plaid item.
 */
export async function refreshPlaidBalances(itemId: string): Promise<void> {
  const itemRes = await query(
    'SELECT id, user_id, access_token_enc FROM plaid_items WHERE item_id = $1',
    [itemId]
  );
  if (itemRes.rows.length === 0) throw new Error(`Plaid item not found: ${itemId}`);

  const item = itemRes.rows[0];
  const accessToken = decryptToken(item.access_token_enc);

  const res = await plaidClient.accountsBalanceGet({ access_token: accessToken });

  for (const acct of res.data.accounts) {
    await query(
      `UPDATE plaid_accounts SET
         current_balance = $1,
         available_balance = $2,
         credit_limit = $3,
         currency_code = $4,
         last_synced_at = NOW(),
         updated_at = NOW()
       WHERE account_id = $5 AND plaid_item_id = $6`,
      [
        acct.balances.current,
        acct.balances.available,
        acct.balances.limit,
        acct.balances.iso_currency_code ?? 'USD',
        acct.account_id,
        item.id,
      ]
    );
  }

  // Also update Firefly account balances (best-effort)
  syncBalancesToFirefly(res.data.accounts).catch(err =>
    logger.error({ err: err instanceof Error ? err.message : err }, 'PlaidSync Firefly balance sync error')
  );
}
