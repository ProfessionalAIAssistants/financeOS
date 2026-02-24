import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { generateMonthlyInsights } from '../../ai/insights';
import { getCategorySpending } from '../../firefly/client';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || '12') || 12));
    const result = await query(
      `SELECT id, user_id, rule_type, severity, title, message, data, sent_at, read_at FROM alert_history
       WHERE user_id = $1 AND rule_type IN ('monthly_insights', 'ai_insight')
       ORDER BY sent_at DESC LIMIT $2`,
      [userId, limit]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insights error');
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

router.get('/latest', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT id, user_id, rule_type, severity, title, message, data, sent_at, read_at FROM alert_history WHERE user_id = $1 AND rule_type = 'monthly_insights' ORDER BY sent_at DESC LIMIT 1`,
      [userId]
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insights/latest error');
    res.status(500).json({ error: 'Failed to fetch latest insight' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const now = new Date();
  const year = parseInt(req.body.year || String(now.getFullYear()));
  const month = parseInt(req.body.month || String(now.getMonth() + 1));
  res.json({ success: true, message: 'Insight generation started' });
  setImmediate(async () => {
    try { await generateMonthlyInsights(year, month, userId); }
    catch (err) { logger.error({ err: err instanceof Error ? err.message : err }, 'Insight generation error'); }
  });
});

router.get('/spending', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const months = Math.min(60, Math.max(1, parseInt(req.query.months as string || '3') || 3));
    const result = await query(
      `SELECT
         DATE_TRUNC('month', snapshot_date) as month,
         SUM((breakdown->>'totalExpenses')::numeric) as expenses,
         SUM((breakdown->>'totalIncome')::numeric) as income,
         AVG(net_worth) as avg_net_worth
       FROM net_worth_snapshots
       WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - ($2 || ' months')::interval
       GROUP BY DATE_TRUNC('month', snapshot_date)
       ORDER BY month DESC`,
      [userId, months]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insights/spending error');
    res.status(500).json({ error: 'Failed to fetch spending data' });
  }
});

router.get('/categories', async (req: Request, res: Response) => {
  try {
    const now   = new Date();
    const start = typeof req.query.start === 'string' && req.query.start
      ? req.query.start
      : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end   = typeof req.query.end === 'string' && req.query.end
      ? req.query.end
      : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const cats = await getCategorySpending(start, end);

    const byCategory = cats
      .map((c: Record<string, unknown>) => {
        const attrs = c.attributes as Record<string, unknown> | undefined;
        const spent = (attrs?.spent as Array<{ sum: string }> | undefined)?.[0]?.sum ?? '0';
        return {
          category: (attrs?.name as string) ?? 'Uncategorized',
          total: Math.abs(parseFloat(spent)),
        };
      })
      .filter((c: { total: number }) => c.total > 0)
      .sort((a: { total: number }, b: { total: number }) => b.total - a.total);

    res.json({ data: { byCategory, start, end } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch category spending' });
  }
});

// Monthly savings rate trend — last 12 months
router.get('/savings-rate', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT
         snapshot_date,
         (breakdown->>'monthlyIncome')::numeric   as income,
         (breakdown->>'monthlyExpenses')::numeric as expenses
       FROM net_worth_snapshots
       WHERE user_id = $1 AND (breakdown->>'monthlyIncome')::numeric > 0
       ORDER BY snapshot_date DESC
       LIMIT 12`,
      [userId]
    );
    const data = result.rows.map(r => {
      const income   = parseFloat(r.income   ?? '0');
      const expenses = parseFloat(r.expenses ?? '0');
      const rate     = income > 0 ? Math.round(((income - expenses) / income) * 100) : null;
      return { date: r.snapshot_date, income, expenses, savingsRate: rate };
    });
    res.json({ data });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insights/savings-rate error');
    res.status(500).json({ error: 'Failed to fetch savings rate' });
  }
});

// Emergency fund metric — months of expenses covered by liquid assets
router.get('/emergency-fund', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const snapRes = await query(
      `SELECT total_assets FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    );
    if (!snapRes.rows[0]) return res.json({ data: null });

    const totalAssets = parseFloat(snapRes.rows[0].total_assets ?? '0');

    // Illiquid: real estate, vehicles, notes, business — can't be drawn as monthly cash
    const illiquidRes = await query(
      `SELECT COALESCE(SUM(current_value), 0) as illiquid_total
       FROM manual_assets
       WHERE is_active = true AND user_id = $1
         AND asset_type IN ('real_estate', 'vehicle', 'note_receivable', 'note_payable', 'business')`,
      [userId]
    );
    const illiquidTotal = parseFloat(illiquidRes.rows[0]?.illiquid_total ?? '0');
    const liquidAssets  = Math.max(0, totalAssets - illiquidTotal);

    // 12-month average monthly expenses for stability
    const expRes = await query(
      `SELECT AVG((breakdown->>'monthlyExpenses')::numeric) as avg_exp
       FROM net_worth_snapshots
       WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - '12 months'::interval
         AND (breakdown->>'monthlyExpenses')::numeric > 0`,
      [userId]
    );
    const avgMonthlyExpenses = parseFloat(expRes.rows[0]?.avg_exp ?? '0');

    const targetMonths  = 6;
    const monthsCovered = avgMonthlyExpenses > 0
      ? Math.round((liquidAssets / avgMonthlyExpenses) * 10) / 10
      : null;
    const pctOfTarget = monthsCovered != null
      ? Math.round((monthsCovered / targetMonths) * 100)
      : null;

    res.json({
      data: { liquidAssets, illiquidAssets: illiquidTotal, avgMonthlyExpenses, monthsCovered, targetMonths, pctOfTarget },
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insights/emergency-fund error');
    res.status(500).json({ error: 'Failed to compute emergency fund metric' });
  }
});

export default router;
