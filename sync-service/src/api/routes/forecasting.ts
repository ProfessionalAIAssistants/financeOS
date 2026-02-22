import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { runForecasting } from '../../ai/forecasting';

const router = Router();

router.get('/latest', async (req: Request, res: Response) => {
  const horizon = parseInt(req.query.horizon as string || '12');
  const result = await query(
    `SELECT * FROM forecast_snapshots WHERE horizon_months = $1 ORDER BY generated_at DESC LIMIT 1`,
    [horizon]
  );
  res.json({ data: result.rows[0] || null });
});

router.get('/history', async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT id, generated_at, horizon_months FROM forecast_snapshots ORDER BY generated_at DESC LIMIT 20`
  );
  res.json({ data: result.rows });
});

router.get('/:id', async (req: Request, res: Response) => {
  const result = await query(`SELECT * FROM forecast_snapshots WHERE id = $1`, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: result.rows[0] });
});

router.post('/generate', async (req: Request, res: Response) => {
  const horizon = parseInt(req.body.horizon || '12');
  res.json({ success: true, message: 'Forecast generation started' });
  setImmediate(async () => {
    try { await runForecasting(horizon); }
    catch (err) { console.error('[Forecasting] Error:', err); }
  });
});

router.post('/whatif', async (req: Request, res: Response) => {
  const {
    incomeChangePct = 0, expenseChangePct = 0, extraMonthlySavings = 0, horizon = 12,
  } = req.body;
  const forecastRes = await query(
    `SELECT scenarios FROM forecast_snapshots WHERE horizon_months = $1 ORDER BY generated_at DESC LIMIT 1`,
    [horizon]
  );
  if (!forecastRes.rows[0]) {
    return res.status(404).json({ error: 'No baseline forecast available. Generate a forecast first.' });
  }
  const base = forecastRes.rows[0].scenarios.base as Array<{ month: number; netWorth: number }>;
  if (!base?.length) return res.status(400).json({ error: 'Invalid forecast data' });
  const statsRes = await query(
    `SELECT
       AVG((breakdown->>'monthlyIncome')::numeric) as avg_income,
       AVG((breakdown->>'monthlyExpenses')::numeric) as avg_expenses
     FROM net_worth_snapshots
     WHERE snapshot_date >= CURRENT_DATE - '90 days'::interval`
  );
  const avgIncome = parseFloat(statsRes.rows[0]?.avg_income || '0');
  const avgExpenses = parseFloat(statsRes.rows[0]?.avg_expenses || '0');
  const adjustedIncome = avgIncome * (1 + incomeChangePct / 100);
  const adjustedExpenses = avgExpenses * (1 + expenseChangePct / 100);
  const monthlyDelta = (adjustedIncome - adjustedExpenses) + extraMonthlySavings;
  const monthlyImprovement = monthlyDelta - (avgIncome - avgExpenses);
  const whatIf = base.map((point, i) => ({
    month: point.month, netWorth: point.netWorth + monthlyImprovement * i,
  }));
  res.json({
    data: {
      baseline: base, whatIf,
      assumptions: {
        incomeChangePct, expenseChangePct, extraMonthlySavings,
        adjustedMonthlyIncome: adjustedIncome, adjustedMonthlyExpenses: adjustedExpenses,
        projectedMonthlySavings: monthlyDelta, monthlyImprovementVsBaseline: monthlyImprovement,
      },
    },
  });
});

export default router;
