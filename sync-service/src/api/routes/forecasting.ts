import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { runForecasting } from '../../ai/forecasting';

const router = Router();

router.get('/latest', async (req: Request, res: Response) => {
  try {
    const horizon = Math.min(120, Math.max(1, parseInt(req.query.horizon as string || '12') || 12));
    const result = await query(
      `SELECT * FROM forecast_snapshots WHERE horizon_months = $1 ORDER BY generated_at DESC LIMIT 1`,
      [horizon]
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    console.error('[Forecasting] GET /latest error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

router.get('/history', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, generated_at, horizon_months FROM forecast_snapshots ORDER BY generated_at DESC LIMIT 20`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('[Forecasting] GET /history error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast history' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(`SELECT * FROM forecast_snapshots WHERE id = $1`, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[Forecasting] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  const horizon        = Math.min(120, Math.max(1,    parseInt(req.body.horizon        || '12')   || 12));
  const withdrawalRate = Math.min(0.10, Math.max(0.01, parseFloat(req.body.withdrawalRate || '0.04') || 0.04));
  const inflationRate  = Math.min(0.15, Math.max(0.00, parseFloat(req.body.inflationRate  || '0.03') || 0.03));
  res.json({ success: true, message: 'Forecast generation started' });
  setImmediate(async () => {
    try { await runForecasting(horizon, withdrawalRate, inflationRate); }
    catch (err) { console.error('[Forecasting] Error:', err); }
  });
});

router.post('/whatif', async (req: Request, res: Response) => {
  try {
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
    const avgIncome    = parseFloat(statsRes.rows[0]?.avg_income    || '0');
    const avgExpenses  = parseFloat(statsRes.rows[0]?.avg_expenses  || '0');
    const adjustedIncome   = avgIncome   * (1 + incomeChangePct   / 100);
    const adjustedExpenses = avgExpenses * (1 + expenseChangePct  / 100);
    const monthlyDelta       = (adjustedIncome - adjustedExpenses) + extraMonthlySavings;
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
  } catch (err) {
    console.error('[Forecasting] POST /whatif error:', err);
    res.status(500).json({ error: 'Failed to compute what-if scenario' });
  }
});

export default router;
