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

router.get('/categories', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const start = req.query.start as string
      || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end   = req.query.end   as string
      || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    // Import lazily to avoid circular deps
    const { default: axios } = await import('axios');
    const { config } = await import('../../config');
    const ff = axios.create({
      baseURL: `${config.fireflyUrl}/api/v1`,
      headers: { Authorization: `Bearer ${config.fireflyToken}` },
      timeout: 15000,
    });
    const r = await ff.get('/categories', { params: { start, end, limit: 200 } });
    const cats = r.data.data ?? [];

    const byCategory = cats
      .map((c: Record<string, unknown>) => {
        const attrs  = c.attributes as Record<string, unknown> | undefined;
        const spent  = (attrs?.spent as Array<{ sum: string }> | undefined)?.[0]?.sum ?? '0';
        return {
          category: (attrs?.name as string) ?? 'Uncategorized',
          total: Math.abs(parseFloat(spent)),
        };
      })
      .filter((c: { total: number }) => c.total > 0)
      .sort((a: { total: number }, b: { total: number }) => b.total - a.total);

    res.json({ data: { byCategory, start, end } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch category spending', details: String(err) });
  }
});

export default router;
