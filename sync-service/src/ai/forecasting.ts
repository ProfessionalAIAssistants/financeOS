import { query } from '../db/client';

interface ScenarioPoint {
  month: number;
  netWorth: number;
}

interface ForecastScenarios {
  base: ScenarioPoint[];
  optimistic: ScenarioPoint[];
  pessimistic: ScenarioPoint[];
}

interface ForecastSummary {
  fireNumber: number;
  monthsToFire: number | null;
  avgMonthlySavings: number;
}

function linearRegression(points: number[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] ?? 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = points.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * points[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export async function runForecasting(horizonMonths = 12): Promise<void> {
  console.log(`[Forecasting] Running ${horizonMonths}-month forecast...`);

  const histRes = await query(
    `SELECT net_worth, snapshot_date
     FROM net_worth_snapshots
     ORDER BY snapshot_date ASC`
  );

  if (histRes.rows.length < 5) {
    console.log('[Forecasting] Not enough data (need 5+ snapshots)');
    return;
  }

  const netWorths = histRes.rows.map(r => parseFloat(r.net_worth));
  const latest = netWorths[netWorths.length - 1];
  const { slope } = linearRegression(netWorths);

  // Monthly savings ≈ slope of net worth over time
  const avgMonthlySavings = slope;

  // Annual expenses approximation for FI/RE number (25× rule)
  const expRes = await query(
    `SELECT AVG((breakdown->>'monthlyExpenses')::numeric) as avg_exp
     FROM net_worth_snapshots
     WHERE snapshot_date >= CURRENT_DATE - '6 months'::interval`
  );
  const avgMonthlyExpenses = parseFloat(expRes.rows[0]?.avg_exp ?? '0');
  const fireNumber = avgMonthlyExpenses * 12 * 25;

  function buildScenario(monthlyDelta: number): ScenarioPoint[] {
    const pts: ScenarioPoint[] = [];
    let val = latest;
    for (let m = 1; m <= horizonMonths; m++) {
      val += monthlyDelta;
      pts.push({ month: m, netWorth: Math.round(val) });
    }
    return pts;
  }

  const base        = buildScenario(avgMonthlySavings);
  const optimistic  = buildScenario(avgMonthlySavings * 1.10);
  const pessimistic = buildScenario(avgMonthlySavings * 0.85);

  // Months to FI/RE
  let monthsToFire: number | null = null;
  if (fireNumber > latest && avgMonthlySavings > 0) {
    monthsToFire = Math.ceil((fireNumber - latest) / avgMonthlySavings);
  }

  const summary: ForecastSummary = {
    fireNumber: Math.round(fireNumber),
    monthsToFire,
    avgMonthlySavings: Math.round(avgMonthlySavings),
  };

  await query(
    `INSERT INTO forecast_snapshots (horizon_months, scenarios, summary)
     VALUES ($1, $2, $3)`,
    [horizonMonths, JSON.stringify({ base, optimistic, pessimistic }), JSON.stringify(summary)]
  );

  console.log(`[Forecasting] Done. FI/RE number: $${fireNumber.toLocaleString()}`);
}
