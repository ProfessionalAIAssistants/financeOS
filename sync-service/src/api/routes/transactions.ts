import { Router, Request, Response } from 'express';
import {
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getAccounts,
  getCategories,
  createCategory,
} from '../../firefly/client';

const router = Router();

// ── Supporting lookups (must be defined BEFORE /:id to avoid route conflicts) ─

// GET /api/transactions/meta/accounts — asset accounts for transfer dropdowns
router.get('/meta/accounts', async (_req: Request, res: Response) => {
  try {
    const accounts = await getAccounts('asset');
    const simplified = accounts.map((a: Record<string, unknown>) => {
      const attrs = a.attributes as Record<string, unknown>;
      return {
        id: a.id,
        name: attrs?.name,
        type: attrs?.type,
        current_balance: attrs?.current_balance,
        currency_symbol: attrs?.currency_symbol ?? '$',
      };
    });
    res.json({ data: simplified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts', details: String(err) });
  }
});

// GET /api/transactions/meta/categories — categories for dropdowns
router.get('/meta/categories', async (_req: Request, res: Response) => {
  try {
    const cats = await getCategories();
    const simplified = cats.map((c: Record<string, unknown>) => ({
      id: c.id,
      name: (c.attributes as Record<string, unknown>)?.name,
    }));
    res.json({ data: simplified });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories', details: String(err) });
  }
});

// POST /api/transactions/meta/categories — create a new category on the fly
router.post('/meta/categories', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const cat = await createCategory(name);
    res.status(201).json({ data: { id: cat.id, name: (cat.attributes as Record<string, unknown>)?.name } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create category', details: String(err) });
  }
});

// ── Transactions CRUD ─────────────────────────────────────────────────────────

// GET /api/transactions — list with pagination, type filter, search query, date range
router.get('/', async (req: Request, res: Response) => {
  try {
    const page       = parseInt(String(req.query.page  ?? '1'));
    const limit      = parseInt(String(req.query.limit ?? '50'));
    const type       = req.query.type       ? String(req.query.type)       : undefined;
    const account_id = req.query.account_id ? String(req.query.account_id) : undefined;
    const query      = req.query.query      ? String(req.query.query)      : undefined;
    const start      = req.query.start      ? String(req.query.start)      : undefined;
    const end        = req.query.end        ? String(req.query.end)        : undefined;

    const txns = await getTransactions(page, limit, type, account_id, query, start, end);

    // Flatten Firefly's nested structure: each "transaction group" has a transactions array
    const flat = txns.flatMap((group: Record<string, unknown>) => {
      const attrs  = group.attributes as Record<string, unknown> | undefined;
      const splits = (attrs?.transactions as Record<string, unknown>[]) ?? [];
      return splits.map((t: Record<string, unknown>) => ({
        id: group.id,
        transaction_journal_id: t.transaction_journal_id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        category_name: t.category_name ?? null,
        category_id: t.category_id ?? null,
        source_name: t.source_name ?? null,
        source_id: t.source_id ?? null,
        destination_name: t.destination_name ?? null,
        destination_id: t.destination_id ?? null,
        tags: t.tags ?? [],
        notes: t.notes ?? null,
        currency_symbol: t.currency_symbol ?? '$',
        reconciled: t.reconciled ?? false,
        budget_name: t.budget_name ?? null,
        budget_id: t.budget_id ?? null,
      }));
    });

    res.json({ data: flat });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions', details: String(err) });
  }
});

// GET /api/transactions/:id — single transaction
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const txn = await getTransaction(String(req.params.id));
    res.json({ data: txn });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction', details: String(err) });
  }
});

// POST /api/transactions — create (withdrawal, deposit, or transfer)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      type, date, description, amount,
      source_id, source_name,
      destination_id, destination_name,
      category_name, budget_id,
      tags, notes,
    } = req.body;

    if (!type || !date || !description || !amount) {
      return res.status(400).json({ error: 'type, date, description, and amount are required' });
    }

    const payload: Record<string, unknown> = {
      type, date, description,
      amount: String(amount),
    };

    if (source_id)       payload.source_id       = source_id;
    if (source_name)     payload.source_name     = source_name;
    if (destination_id)  payload.destination_id  = destination_id;
    if (destination_name) payload.destination_name = destination_name;
    if (category_name)   payload.category_name   = category_name;
    if (budget_id)       payload.budget_id       = budget_id;
    if (tags?.length)    payload.tags            = tags;
    if (notes)           payload.notes           = notes;

    const result = await createTransaction(payload);
    res.status(201).json({ data: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create transaction', details: String(err) });
  }
});

// PUT /api/transactions/:id — update
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const {
      description, amount, date,
      category_name, category_id,
      tags, notes, budget_id,
      source_id, destination_id,
    } = req.body;

    const payload: Record<string, unknown> = {};
    if (description  !== undefined) payload.description  = description;
    if (amount       !== undefined) payload.amount       = String(amount);
    if (date         !== undefined) payload.date         = date;
    if (category_name !== undefined) payload.category_name = category_name;
    if (category_id  !== undefined) payload.category_id  = category_id;
    if (tags         !== undefined) payload.tags         = tags;
    if (notes        !== undefined) payload.notes        = notes;
    if (budget_id    !== undefined) payload.budget_id    = budget_id;
    if (source_id    !== undefined) payload.source_id    = source_id;
    if (destination_id !== undefined) payload.destination_id = destination_id;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await updateTransaction(String(req.params.id), payload);
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction', details: String(err) });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteTransaction(String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction', details: String(err) });
  }
});

export default router;
