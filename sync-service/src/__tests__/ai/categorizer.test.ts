/**
 * Tests for categorizeTransactions.
 *
 * Strategy:
 *  - Mock the DB client so no real Postgres connection is needed.
 *  - When the DB returns no cached category and OPENAI_API_KEY is unset,
 *    the function uses its built-in rule dictionary and falls through to 'other'.
 *  - When OPENAI_API_KEY is set we mock the OpenAI client.
 */

// ── Mocks must be hoisted before any imports ─────────────────────────────────
const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

// Mutable config mock — AI key defaults to empty; individual tests may override
const mockConfig = { openaiApiKey: '' };
jest.mock('../../config', () => ({ config: mockConfig }));

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '["dining","income","subscriptions"]' } }],
        }),
      },
    },
  }));
});

// ── Import under test (after mocks) ──────────────────────────────────────────
import { categorizeTransactions } from '../../ai/categorizer';

// Helper: make DB return "empty" (no cached category)
function dbNoCache() {
  mockQuery.mockResolvedValue({ rows: [] });
}

// Helper: make DB return a cached category
function dbCached(category: string) {
  mockQuery.mockResolvedValueOnce({ rows: [{ category }] });
}

const tx = (id: string, description: string, amount = 50) => ({
  id,
  description,
  amount,
  date: '2026-01-01',
});

afterEach(() => {
  mockQuery.mockReset();
  mockConfig.openaiApiKey = '';
});

// ── Rule-based categorisation ─────────────────────────────────────────────────

describe('categorizeTransactions – rule-based (no AI key)', () => {
  beforeEach(() => {
    // sets default return for all calls: cache lookups + cacheMerchant inserts
    dbNoCache();
  });

  test.each([
    ['AMAZON purchase', 'shopping'],
    ['WALMART Supercenter', 'shopping'],
    ['TARGET store', 'shopping'],
    ['NETFLIX subscription', 'subscriptions'],
    ['SPOTIFY premium', 'subscriptions'],
    ['DISNEY+ annual', 'subscriptions'],
    ['UBER EATS order', 'dining'],
    ['DOORDASH delivery', 'dining'],
    ['CHIPOTLE Mexican grill', 'dining'],
    ['MCDONALDS fast food', 'dining'],
    ['SHELL gas station', 'gas'],
    ['CHEVRON 1234', 'gas'],
    ['EXXON MOBIL', 'gas'],
    ['PAYROLL direct deposit', 'income'],
    ['SALARY payment', 'income'],
    ['DIRECT DEP employer', 'income'],
    ['ZELLE transfer', 'transfer'],
    ['VENMO payment transfer', 'transfer'],
    ['ATM withdrawal', 'atm/cash'],
    ['CVS pharmacy', 'healthcare'],
    ['WALGREENS store', 'healthcare'],
    ['MEDICAL clinic', 'healthcare'],
    ['XCEL energy bill', 'utilities'],
    ['PG&E electric utility', 'utilities'],
  ])('"%s" → %s', async (description, expectedCategory) => {
    const results = await categorizeTransactions([tx('1', description)]);
    expect(results.get('1')).toBe(expectedCategory);
  });

  test('unknown merchant falls back to "other"', async () => {
    const results = await categorizeTransactions([tx('1', 'SOME RANDOM STORE XYZ')]);
    expect(results.get('1')).toBe('other');
  });

  test('returns a Map with an entry for every input transaction', async () => {
    const txns = [tx('a', 'AMAZON'), tx('b', 'NETFLIX'), tx('c', 'SOME RANDOM XYZ')];
    const results = await categorizeTransactions(txns);
    expect(results.size).toBe(txns.length);
    for (const t of txns) expect(results.has(t.id)).toBe(true);
  });

  test('handles empty transaction array', async () => {
    const results = await categorizeTransactions([]);
    expect(results.size).toBe(0);
  });
});

// ── DB cache hit ──────────────────────────────────────────────────────────────

describe('categorizeTransactions – DB cache hit', () => {
  test('uses cached category when DB has a match', async () => {
    // First query (cache lookup) returns cached value
    mockQuery.mockResolvedValueOnce({ rows: [{ category: 'education' }] });
    const results = await categorizeTransactions([tx('1', 'COURSERA membership')]);
    expect(results.get('1')).toBe('education');
  });

  test('falls back to rule when DB throws (unreachable)', async () => {
    mockQuery.mockRejectedValue(new Error('DB unreachable'));
    const results = await categorizeTransactions([tx('1', 'AMAZON order')]);
    expect(results.get('1')).toBe('shopping');
  });
});

// ── AI path ───────────────────────────────────────────────────────────────────

describe('categorizeTransactions – AI path', () => {
  beforeEach(() => {
    mockConfig.openaiApiKey = 'sk-test-key';
    // DB: no cache for any merchant
    mockQuery.mockResolvedValue({ rows: [] });
  });

  test('uses AI categories returned for unrecognised merchants', async () => {
    const txns = [
      tx('1', 'FOREIGN BISTRO XYZ', 30),    // → "dining"
      tx('2', 'PAYCHECK CORP', 5000),         // → "income"
      tx('3', 'STREAMING CO', 14.99),         // → "subscriptions"
    ];
    const results = await categorizeTransactions(txns);
    expect(results.get('1')).toBe('dining');
    expect(results.get('2')).toBe('income');
    expect(results.get('3')).toBe('subscriptions');
  });

  test('falls back to "other" if AI returns invalid category', async () => {
    // Override the mock to return invalid category
    const OpenAI = require('openai');
    OpenAI.mockImplementationOnce(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: '["not_a_real_category"]' } }],
          }),
        },
      },
    }));

    const results = await categorizeTransactions([tx('1', 'MYSTERY STORE QWERTY', 20)]);
    expect(results.get('1')).toBe('other');
  });

  test('falls back to "other" when AI call fails', async () => {
    const OpenAI = require('openai');
    OpenAI.mockImplementationOnce(() => ({
      chat: {
        completions: {
          create: jest.fn().mockRejectedValue(new Error('Rate limit')),
        },
      },
    }));
    const results = await categorizeTransactions([tx('1', 'MYSTERY CO', 20)]);
    // The catch block in categorizer sets 'other' for all needsAI transactions
    expect(results.get('1')).toBe('other');
  });
});
