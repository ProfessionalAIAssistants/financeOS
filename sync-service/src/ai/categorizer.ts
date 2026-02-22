import OpenAI from 'openai';
import { config } from '../config';
import { query } from '../db/client';

const CATEGORIES = [
  'groceries', 'dining', 'gas', 'utilities', 'rent/mortgage', 'insurance',
  'healthcare', 'entertainment', 'shopping', 'travel', 'subscriptions',
  'income', 'transfer', 'atm/cash', 'fees', 'investments', 'education',
  'charity', 'home/garden', 'other',
];

const RULES: Array<[RegExp, string]> = [
  [/amazon|walmart|target|costco|kroger/i, 'shopping'],
  [/netflix|spotify|hulu|disney|apple.*sub/i, 'subscriptions'],
  [/uber.*eat|doordash|grubhub|chipotle|mcdonald/i, 'dining'],
  [/shell|chevron|exxon|bp|mobil|gas.*station/i, 'gas'],
  [/payroll|salary|direct.*dep/i, 'income'],
  [/electric|gas.*utility|water.*util|xcel|pg&e/i, 'utilities'],
  [/cvs|walgreens|pharmacy|medical|dental|doctor/i, 'healthcare'],
  [/transfer|zelle|venmo|paypal.*transfer/i, 'transfer'],
  [/atm|cash.*advance/i, 'atm/cash'],
];

function ruleBasedCategory(description: string): string | null {
  const lower = description.toLowerCase();
  for (const [re, cat] of RULES) {
    if (re.test(lower)) return cat;
  }
  return null;
}

interface TxInput {
  id: string;
  description: string;
  amount: number;
  date: string;
}

export async function categorizeTransactions(transactions: TxInput[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const needsAI: TxInput[] = [];

  for (const tx of transactions) {
    // Check DB cache
    try {
      const r = await query(
        'SELECT category FROM merchant_categories WHERE merchant_name = $1',
        [tx.description.toLowerCase().trim()]
      );
      if (r.rows.length > 0) {
        results.set(tx.id, r.rows[0].category);
        continue;
      }
    } catch { /* DB not ready */ }

    // Rule-based fallback
    const cat = ruleBasedCategory(tx.description);
    if (cat) {
      results.set(tx.id, cat);
      await cacheMerchant(tx.description, cat, 'rule');
      continue;
    }

    needsAI.push(tx);
  }

  if (needsAI.length === 0 || !config.openaiApiKey) {
    for (const tx of needsAI) results.set(tx.id, 'other');
    return results;
  }

  // Batch AI categorization
  try {
    const openai = new OpenAI({ apiKey: config.openaiApiKey });
    const prompt = needsAI.map((t, i) =>
      `${i + 1}. "${t.description}" $${t.amount}`
    ).join('\n');

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Categorize each transaction into exactly one of: ${CATEGORIES.join(', ')}. Reply with only a JSON array of strings, one per transaction, in order.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 200,
    });

    const raw = resp.choices[0].message.content ?? '[]';
    const cats = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]') as string[];

    for (let i = 0; i < needsAI.length; i++) {
      const cat = cats[i] ?? 'other';
      const valid = CATEGORIES.includes(cat) ? cat : 'other';
      results.set(needsAI[i].id, valid);
      await cacheMerchant(needsAI[i].description, valid, 'ai');
    }
  } catch {
    for (const tx of needsAI) results.set(tx.id, 'other');
  }

  return results;
}

async function cacheMerchant(merchant: string, category: string, source: string) {
  try {
    await query(
      `INSERT INTO merchant_categories (merchant_name, category, source)
       VALUES ($1, $2, $3) ON CONFLICT (merchant_name) DO NOTHING`,
      [merchant.toLowerCase().trim(), category, source]
    );
  } catch { /* ignore */ }
}
