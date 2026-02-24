import { createTransaction, getTransactions } from './client';
import { query } from '../db/client';
import logger from '../lib/logger';

export interface RawTransaction {
  id?: string;
  date: string;
  name: string;
  amount: number;
  type?: string;
  memo?: string;
}

function normalizeAmount(val: string | number): number {
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[$,]/g, ''));
}

function parseTransactionDate(d: string): string {
  if (!d) return new Date().toISOString().split('T')[0];
  // YYYYMMDD
  if (/^\d{8}$/.test(d)) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  // MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    const [m, day, y] = d.split('/');
    return `${y}-${m}-${day}`;
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  try {
    return new Date(d).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

async function isImported(externalId: string, institution: string): Promise<boolean> {
  try {
    const r = await query(
      'SELECT id FROM imported_transactions WHERE external_id = $1 AND institution_name = $2',
      [externalId, institution]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function markImported(externalId: string, institution: string, fireflyId: string) {
  try {
    await query(
      `INSERT INTO imported_transactions (external_id, institution_name, firefly_transaction_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [externalId, institution, fireflyId]
    );
  } catch {
    // Ignore
  }
}

export async function upsertTransactions(
  institution: string,
  fireflyAccountId: string,
  transactions: RawTransaction[]
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  for (const tx of transactions) {
    const externalId = tx.id ?? `${institution}-${tx.date}-${tx.name}-${tx.amount}`;
    if (await isImported(externalId, institution)) {
      skipped++;
      continue;
    }

    const amount = normalizeAmount(tx.amount);
    const absAmount = Math.abs(amount);
    const txType = amount < 0 ? 'withdrawal' : 'deposit';
    const dateStr = parseTransactionDate(tx.date);

    try {
      const ffData = {
        type: txType,
        date: dateStr,
        amount: absAmount.toFixed(2),
        description: tx.name || 'Unknown',
        notes: tx.memo ?? '',
        external_id: externalId,
        source_id: txType === 'withdrawal' ? fireflyAccountId : undefined,
        destination_id: txType === 'deposit' ? fireflyAccountId : undefined,
        source_name: txType === 'deposit' ? tx.name : undefined,
        destination_name: txType === 'withdrawal' ? tx.name : undefined,
      };

      const created = await createTransaction(ffData);
      const createdId = String(created?.id ?? '');
      await markImported(externalId, institution, createdId);
      added++;
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('duplicate')) {
        skipped++;
      } else {
        logger.error({ err, externalId }, '[Transactions] Failed to import');
        skipped++;
      }
    }
  }

  return { added, skipped };
}
