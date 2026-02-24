import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { runForecasting } from '../../ai/forecasting';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

router.get('/latest', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const horizon = Math.min(120, Math.max(1, parseInt(req.query.horizon as string || '12') || 12));
    const result = await query(
      `SELECT id, user_id, generated_at, horizon_months, base_monthly_income, base_monthly_expenses, current_net_worth, scenarios
       FROM forecast_snapshots WHERE user_id = $1 AND horizon_months = $2 ORDER BY generated_at DESC LIMIT 1`,
      [userId, horizon]
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /forecasting/latest error');
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT id, generated_at, horizon_months FROM forecast_snapshots WHERE user_id = $1 ORDER BY generated_at DESC LIMIT 20`,
      [userId]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /forecasting/history error');
    res.status(500).json({ error: 'Failed to fetch forecast history' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT id, user_id, generated_at, horizon_months, base_monthly_income, base_monthly_expenses, current_net_worth, scenarios
       FROM forecast_snapshots WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /forecasting/:id error');
    res.status(500).json({ error: 'Failed to fetch forecast' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const horizon        = Math.min(120, Math.max(1,    parseInt(req.body.horizon        || '12')   || 12));
  const withdrawalRate = Math.min(0.10, Math.max(0.01, parseFloat(req.body.withdrawalRate || '0.04') || 0.04));
  const inflationRate  = Math.min(0.15, Math.max(0.00, parseFloat(req.body.inflationRate  || '0.03') || 0.03));
  res.json({ success: true, message: 'Forecast generation started' });
  setImmediate(async () => {
    try { await runForecasting(horizon, withdrawalRate, inflationRate, userId); }
    catch (err) { logger.error({ err: err instanceof Error ? err.message : err }, 'Forecasting generation error'); }
  });
});

router.post('/whatif', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const {
      incomeChangePct = 0, expenseChangePct = 0, extraMonthlySavings = 0, horizon = 12,
    } = req.body;
    const forecastRes = await query(
      `SELECT scenarios FROM forecast_snapshots WHERE user_id = $1 AND horizon_months = $2 ORDER BY generated_at DESC LIMIT 1`,
      [userId, horizon]
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
       WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - '90 days'::interval`,
      [userId]
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
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /forecasting/whatif error');
    res.status(500).json({ error: 'Failed to compute what-if scenario' });
  }
});

export default router;
