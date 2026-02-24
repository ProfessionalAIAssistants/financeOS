import { Router, Request, Response } from 'express';
import {
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetLimits,
  createBudgetLimit,
  updateBudgetLimit,
  deleteBudgetLimit,
  getBudgetTransactions,
} from '../../firefly/client';

const router = Router();

// ── Budgets CRUD ──────────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response) => {
  try {
    const budgets = await getBudgets();
    res.json({ data: budgets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const budget = await getBudget(String(req.params.id));
    res.json({ data: budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, active, auto_budget_type, auto_budget_amount, auto_budget_period } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const budget = await createBudget({ name, active, auto_budget_type, auto_budget_amount, auto_budget_period });
    res.status(201).json({ data: budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const budget = await updateBudget(String(req.params.id), req.body);
    res.json({ data: budget });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteBudget(String(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// ── Budget Limits (spending caps per period) ───────────────────────────────────

router.get('/:id/limits', async (req: Request, res: Response) => {
  try {
    const start = req.query.start ? String(req.query.start) : undefined;
    const end   = req.query.end   ? String(req.query.end)   : undefined;
    const limits = await getBudgetLimits(String(req.params.id), start, end);
    res.json({ data: limits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget limits' });
  }
});

router.post('/:id/limits', async (req: Request, res: Response) => {
  try {
    const { start, end, amount, currency_id } = req.body;
    if (!start || !end || !amount) return res.status(400).json({ error: 'start, end, and amount are required' });
    const limit = await createBudgetLimit(String(req.params.id), { start, end, amount, currency_id });
    res.status(201).json({ data: limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create budget limit' });
  }
});

router.put('/:id/limits/:limitId', async (req: Request, res: Response) => {
  try {
    const limit = await updateBudgetLimit(String(req.params.id), String(req.params.limitId), req.body);
    res.json({ data: limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update budget limit' });
  }
});

router.delete('/:id/limits/:limitId', async (req: Request, res: Response) => {
  try {
    await deleteBudgetLimit(String(req.params.id), String(req.params.limitId));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete budget limit' });
  }
});

// ── Budget Transactions ────────────────────────────────────────────────────────

router.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const start = req.query.start ? String(req.query.start) : undefined;
    const end   = req.query.end   ? String(req.query.end)   : undefined;
    const page  = parseInt(String(req.query.page  ?? '1'));
    const limit = parseInt(String(req.query.limit ?? '50'));
    const txns = await getBudgetTransactions(String(req.params.id), start, end, page, limit);
    res.json({ data: txns });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch budget transactions' });
  }
});

export default router;
