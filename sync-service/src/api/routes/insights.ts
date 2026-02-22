import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { generateMonthlyInsights } from '../../ai/insights';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || '12');
  const result = await query(
    `SELECT * FROM alert_history
     WHERE rule_type IN ('monthly_insights', 'ai_insight')
     ORDER BY sent_at DESC LIMIT $1`,
    [limit]
  );
  res.json({ data: result.rows });
});

router.get('/latest', async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT * FROM alert_history WHERE rule_type = 'monthly_insights' ORDER BY sent_at DESC LIMIT 1`
  );
  res.json({ data: result.rows[0] || null });
});

router.post('/generate', async (req: Request, res: Response) => {
  const now = new Date();
  const year = parseInt(req.body.year || String(now.getFullYear()));
  const month = parseInt(req.body.month || String(now.getMonth() + 1));
  res.json({ success: true, message: 'Insight generation started' });
  setImmediate(async () => {
    try { await generateMonthlyInsights(year, month); }
    catch (err) { console.error('[Insights] Error:', err); }
  });
});

router.get('/spending', async (req: Request, res: Response) => {
  const months = parseInt(req.query.months as string || '3');
  const result = await query(
    `SELECT
       DATE_TRUNC('month', snapshot_date) as month,
       SUM((breakdown->>'totalExpenses')::numeric) as expenses,
       SUM((breakdown->>'totalIncome')::numeric) as income,
       AVG(net_worth) as avg_net_worth
     FROM net_worth_snapshots
     WHERE snapshot_date >= CURRENT_DATE - ($1 || ' months')::interval
     GROUP BY DATE_TRUNC('month', snapshot_date)
     ORDER BY month DESC`,
    [months]
  );
  res.json({ data: result.rows });
});

export default router;
