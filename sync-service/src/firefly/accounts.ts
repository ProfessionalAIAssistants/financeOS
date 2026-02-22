import { getAccounts, createAccount } from './client';
import { query } from '../db/client';

const accountCache: Record<string, string> = {};

export async function upsertAccount(
  institutionName: string,
  externalId: string,
  name: string,
  type = 'asset',
  currency = 'USD',
  balance?: number
): Promise<string> {
  const cacheKey = `${institutionName}:${externalId}`;
  if (accountCache[cacheKey]) return accountCache[cacheKey];

  // Check DB mapping first
  try {
    const cr = await query(
      'SELECT firefly_account_map FROM institution_config WHERE institution_name = $1',
      [institutionName]
    );
    if (cr.rows.length > 0) {
      const map: Record<string, string> = cr.rows[0].firefly_account_map ?? {};
      if (map[externalId]) {
        accountCache[cacheKey] = map[externalId];
        return map[externalId];
      }
    }
  } catch {
    // DB not ready yet, continue
  }

  // Search Firefly for existing account
  const displayName = `[${institutionName.toUpperCase()}] ${name}`;
  try {
    const existing = await getAccounts('asset');
    const found = existing.find((a: { attributes: { name: string } }) =>
      a.attributes.name === displayName
    );
    if (found) {
      const id = String(found.id);
      accountCache[cacheKey] = id;
      await saveMapping(institutionName, externalId, id);
      return id;
    }
  } catch {
    // Firefly not ready
  }

  // Create new account
  const ffType = type === 'credit' ? 'liabilities' : 'asset';
  const created = await createAccount({
    name: displayName,
    type: ffType,
    currency_code: currency,
    current_balance: balance ?? 0,
    current_balance_date: new Date().toISOString().split('T')[0],
  });
  const newId = String(created.id);
  accountCache[cacheKey] = newId;
  await saveMapping(institutionName, externalId, newId);
  return newId;
}

async function saveMapping(institution: string, externalId: string, fireflyId: string) {
  try {
    await query(
      `INSERT INTO institution_config (institution_name, firefly_account_map)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (institution_name) DO UPDATE
       SET firefly_account_map = institution_config.firefly_account_map || $2::jsonb`,
      [institution, JSON.stringify({ [externalId]: fireflyId })]
    );
  } catch {
    // Ignore if DB not available
  }
}
