import { query } from '../db/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScenarioPoint {
  month: number;
  netWorth: number;
}

interface MonteCarloScenarios {
  p10: ScenarioPoint[];
  p25: ScenarioPoint[];
  p50: ScenarioPoint[];
  p75: ScenarioPoint[];
  p90: ScenarioPoint[];
}

interface ForecastScenarios {
  base: ScenarioPoint[];
  optimistic: ScenarioPoint[];
  pessimistic: ScenarioPoint[];
  monteCarlo: MonteCarloScenarios;
}

interface ForecastSummary {
  fireNumber: number;
  monthsToFire: number | null;
  avgMonthlySavings: number;
  monthlyVolatility: number;
  withdrawalRate: number;
  inflationRate: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  mc_fireProbability: number;
  mc_monthsToFire_p50: number | null;
  mc_monthsToFire_p10: number | null;
  mc_monthsToFire_p90: number | null;
  mc_sustainabilityRate: number | null; // % of fire-hitting trials that sustain 30yr withdrawals
}

// ── Math utilities ────────────────────────────────────────────────────────────

/**
 * Box-Muller transform: produces a normally distributed random variable
 * with given mean and standard deviation.
 */
function randNormal(mean: number, std: number): number {
  if (std === 0) return mean;
  let u1: number;
  do { u1 = Math.random(); } while (u1 === 0); // avoid log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

/**
 * Linear interpolation percentile on a pre-sorted array.
 * p is in [0, 100].
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function linearRegression(points: number[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0] ?? 0 };
  const xs    = Array.from({ length: n }, (_, i) => i);
  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = points.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * points[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);
  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Standard deviation of month-over-month changes in net worth. */
function monthlyVolatility(netWorths: number[]): number {
  if (netWorths.length < 2) return 0;
  const changes  = netWorths.slice(1).map((v, i) => v - netWorths[i]);
  const mean     = changes.reduce((a, b) => a + b, 0) / changes.length;
  const variance = changes.reduce((acc, c) => acc + (c - mean) ** 2, 0) / changes.length;
  return Math.sqrt(variance);
}

// ── Post-FI/RE sustainability simulation ──────────────────────────────────────

/**
 * For each portfolio value at the moment of FI/RE, simulate 30 years of
 * inflation-adjusted withdrawals and return the fraction that survive.
 *
 * Survival = portfolio never goes to zero over the full period.
 * This captures sequence-of-returns risk in early retirement.
 */
function runSustainability(
  portfolioAtFire: number[],
  annualWithdrawal: number,
  meanMonthly: number,
  sigmaMonthly: number,
  inflationRate: number,
  nYears = 30,
): number {
  if (portfolioAtFire.length === 0) return 0;
  const months = nYears * 12;
  const monthlyInflation = inflationRate / 12;
  let survived = 0;

  for (const startVal of portfolioAtFire) {
    let val = startVal;
    let monthlyWithdrawal = annualWithdrawal / 12;
    let depleted = false;

    for (let m = 0; m < months; m++) {
      val += randNormal(meanMonthly, sigmaMonthly);
      val -= monthlyWithdrawal;
      monthlyWithdrawal *= (1 + monthlyInflation); // withdrawal grows with inflation
      if (val <= 0) { depleted = true; break; }
    }

    if (!depleted) survived++;
  }

  return Math.round((survived / portfolioAtFire.length) * 100);
}

// ── Monte Carlo engine ────────────────────────────────────────────────────────

interface MonteCarloResult {
  scenarios: MonteCarloScenarios;
  fireProbability: number;
  monthsToFire_p10: number | null;
  monthsToFire_p50: number | null;
  monthsToFire_p90: number | null;
  portfoliosAtFire: number[];
}

/**
 * Run N independent Monte Carlo trials starting from liquidNetWorth.
 *
 * Each month, the net worth change is drawn from N(μ, σ) — the empirical
 * distribution of historical monthly net worth changes. This is a
 * random-walk-with-drift model, the standard approach for personal finance
 * Monte Carlo projection.
 *
 * The simulation uses liquid net worth only (illiquid assets excluded) so
 * the FI/RE target represents genuinely drawable wealth.
 */
function runMonteCarlo(
  liquidNetWorth: number,
  meanMonthly: number,
  sigmaMonthly: number,
  horizonMonths: number,
  fireNumber: number,
  nTrials = 1000,
): MonteCarloResult {
  const trialsByMonth: number[][] = Array.from({ length: horizonMonths }, () => []);
  const monthsToFirePerTrial: (number | null)[] = [];
  const portfoliosAtFire: number[] = [];

  for (let t = 0; t < nTrials; t++) {
    let val = liquidNetWorth;
    let firstCrossed: number | null = null;

    for (let m = 0; m < horizonMonths; m++) {
      val += randNormal(meanMonthly, sigmaMonthly);
      trialsByMonth[m].push(val);
      if (firstCrossed === null && fireNumber > 0 && val >= fireNumber) {
        firstCrossed = m + 1;
        portfoliosAtFire.push(val);
      }
    }

    monthsToFirePerTrial.push(firstCrossed);
  }

  for (const arr of trialsByMonth) arr.sort((a, b) => a - b);

  const makeTrajectory = (p: number): ScenarioPoint[] =>
    trialsByMonth.map((arr, i) => ({
      month:    i + 1,
      netWorth: Math.round(percentile(arr, p)),
    }));

  const scenarios: MonteCarloScenarios = {
    p10: makeTrajectory(10),
    p25: makeTrajectory(25),
    p50: makeTrajectory(50),
    p75: makeTrajectory(75),
    p90: makeTrajectory(90),
  };

  const trialsHitFire   = monthsToFirePerTrial.filter(m => m !== null) as number[];
  const fireProbability = Math.round((trialsHitFire.length / nTrials) * 100);

  let monthsToFire_p10: number | null = null;
  let monthsToFire_p50: number | null = null;
  let monthsToFire_p90: number | null = null;

  if (trialsHitFire.length > 0) {
    const sorted = [...trialsHitFire].sort((a, b) => a - b);
    monthsToFire_p10 = Math.round(percentile(sorted, 10));
    monthsToFire_p50 = Math.round(percentile(sorted, 50));
    monthsToFire_p90 = Math.round(percentile(sorted, 90));
  }

  return { scenarios, fireProbability, monthsToFire_p10, monthsToFire_p50, monthsToFire_p90, portfoliosAtFire };
}

// ── Deterministic scenario builder ────────────────────────────────────────────

function buildDeterministicScenario(
  initial: number,
  monthlyDelta: number,
  horizonMonths: number,
): ScenarioPoint[] {
  const pts: ScenarioPoint[] = [];
  let val = initial;
  for (let m = 1; m <= horizonMonths; m++) {
    val += monthlyDelta;
    pts.push({ month: m, netWorth: Math.round(val) });
  }
  return pts;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runForecasting(
  horizonMonths  = 12,
  withdrawalRate = 0.04,  // e.g. 0.04 = 4% safe withdrawal rate
  inflationRate  = 0.03,  // e.g. 0.03 = 3% annual inflation
): Promise<void> {
  console.log(
    `[Forecasting] Running ${horizonMonths}-month Monte Carlo (1000 trials, ` +
    `withdrawal=${(withdrawalRate * 100).toFixed(2)}%, inflation=${(inflationRate * 100).toFixed(1)}%)...`
  );

  // ── Historical net worth ─────────────────────────────────────────────────
  const histRes = await query(
    `SELECT net_worth, snapshot_date
     FROM net_worth_snapshots
     ORDER BY snapshot_date ASC`
  );

  if (histRes.rows.length < 5) {
    console.log('[Forecasting] Not enough data (need 5+ snapshots)');
    return;
  }

  const netWorths         = histRes.rows.map(r => parseFloat(r.net_worth));
  const latest            = netWorths[netWorths.length - 1];
  const { slope }         = linearRegression(netWorths);
  const avgMonthlySavings = slope;
  // Total-NW volatility is computed here but replaced below once illiquidTotal is known.
  // We keep it for the deterministic scenario bands (which use total NW).
  const sigma             = monthlyVolatility(netWorths);

  // ── Expense average — 12-month lookback for stability ───────────────────
  const expRes = await query(
    `SELECT AVG((breakdown->>'monthlyExpenses')::numeric) as avg_exp
     FROM net_worth_snapshots
     WHERE snapshot_date >= CURRENT_DATE - '12 months'::interval`
  );
  const avgMonthlyExpenses = parseFloat(expRes.rows[0]?.avg_exp ?? '0');

  // FI/RE number = annual expenses / withdrawal rate  (25× at 4%, 33× at 3%, etc.)
  const fireNumber = avgMonthlyExpenses > 0
    ? (avgMonthlyExpenses * 12) / withdrawalRate
    : 0;

  // ── Separate liquid vs illiquid net worth ────────────────────────────────
  // Illiquid assets (real estate, vehicles, notes, business) cannot be
  // drawn down as monthly cash flow in retirement — exclude from MC target.
  const illiquidRes = await query(
    `SELECT COALESCE(SUM(current_value), 0) as illiquid_total
     FROM manual_assets
     WHERE is_active = true
       AND asset_type IN ('real_estate', 'vehicle', 'note_receivable', 'note_payable', 'business')`
  );
  const illiquidTotal  = parseFloat(illiquidRes.rows[0]?.illiquid_total ?? '0');
  const liquidNetWorth = Math.max(0, latest - illiquidTotal);

  // ── Liquid-only σ for MC ─────────────────────────────────────────────────
  // σ from total net worth is inflated when large illiquid assets (real estate,
  // vehicles) dominate the variance. Approximate liquid-only history by
  // subtracting the CURRENT illiquid total from each historical snapshot.
  // This assumes illiquid composition was broadly similar over the period —
  // a reasonable approximation when the asset mix is stable.
  const liquidNetWorths = netWorths.map(nw => Math.max(0, nw - illiquidTotal));
  const liquidSigma     = monthlyVolatility(liquidNetWorths);

  // ── Deterministic scenarios (total net worth for chart continuity) ───────
  const base        = buildDeterministicScenario(latest, avgMonthlySavings,         horizonMonths);
  const optimistic  = buildDeterministicScenario(latest, avgMonthlySavings + sigma,  horizonMonths);
  const pessimistic = buildDeterministicScenario(latest, avgMonthlySavings - sigma,  horizonMonths);

  // Deterministic months-to-FIRE (liquid portion vs liquid target)
  let monthsToFire: number | null = null;
  if (fireNumber > 0 && liquidNetWorth >= fireNumber) {
    monthsToFire = 0;
  } else if (fireNumber > liquidNetWorth && avgMonthlySavings > 0) {
    monthsToFire = Math.ceil((fireNumber - liquidNetWorth) / avgMonthlySavings);
  }

  // ── Monte Carlo simulation ───────────────────────────────────────────────
  // Uses liquidSigma (volatility of liquid-only NW) so property/vehicle price
  // swings don't artificially widen the projection bands.
  const mc = runMonteCarlo(liquidNetWorth, avgMonthlySavings, liquidSigma, horizonMonths, fireNumber, 1000);

  // ── Post-FI/RE sustainability (sequence-of-returns risk) ─────────────────
  // For every trial that crossed FI/RE, simulate 30 years of inflation-adjusted
  // withdrawals. In retirement there is no salary income, so the portfolio drift
  // is 0 (conservative: assumes no real investment return beyond volatility).
  // This errs on the side of caution — true sustainability will be higher if the
  // portfolio earns positive real returns.
  let mc_sustainabilityRate: number | null = null;
  if (mc.portfoliosAtFire.length > 0 && fireNumber > 0) {
    mc_sustainabilityRate = runSustainability(
      mc.portfoliosAtFire,
      fireNumber * withdrawalRate,  // annual withdrawal amount
      0,            // mean monthly drift = 0 in retirement (no salary; conservative)
      liquidSigma,  // same liquid-portfolio volatility
      inflationRate,
      30,
    );
  }

  // ── Assemble and persist ─────────────────────────────────────────────────
  const scenarios: ForecastScenarios = {
    base,
    optimistic,
    pessimistic,
    monteCarlo: mc.scenarios,
  };

  const summary: ForecastSummary = {
    fireNumber:            Math.round(fireNumber),
    monthsToFire,
    avgMonthlySavings:     Math.round(avgMonthlySavings),
    monthlyVolatility:     Math.round(liquidSigma),
    withdrawalRate,
    inflationRate,
    liquidNetWorth:        Math.round(liquidNetWorth),
    illiquidNetWorth:      Math.round(illiquidTotal),
    mc_fireProbability:    mc.fireProbability,
    mc_monthsToFire_p10:   mc.monthsToFire_p10,
    mc_monthsToFire_p50:   mc.monthsToFire_p50,
    mc_monthsToFire_p90:   mc.monthsToFire_p90,
    mc_sustainabilityRate,
  };

  await query(
    `INSERT INTO forecast_snapshots (horizon_months, scenarios, summary)
     VALUES ($1, $2, $3)`,
    [horizonMonths, JSON.stringify(scenarios), JSON.stringify(summary)]
  );

  console.log(
    `[Forecasting] Done. Liquid $${liquidNetWorth.toLocaleString()} | ` +
    `Illiquid $${illiquidTotal.toLocaleString()} | ` +
    `FI/RE $${Math.round(fireNumber).toLocaleString()} (${(withdrawalRate * 100).toFixed(2)}% rule) | ` +
    `MC hit ${mc.fireProbability}% | 30yr sustain ${mc_sustainabilityRate ?? 'N/A'}% | ` +
    `liquid σ $${Math.round(liquidSigma).toLocaleString()}/mo (total σ $${Math.round(sigma).toLocaleString()}/mo)`
  );
}
