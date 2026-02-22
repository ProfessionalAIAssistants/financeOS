/**
 * Tests for runForecasting.
 *
 * linearRegression is an unexported helper — we exercise it through the
 * public runForecasting function by inspecting what gets written to "forecast_snapshots".
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

import { runForecasting } from '../../ai/forecasting';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a sequence of mock DB call responses for runForecasting:
 *   1. net_worth_snapshots SELECT (history)
 *   2. net_worth_snapshots SELECT (avg monthly expenses)
 *   3. forecast_snapshots  INSERT
 */
function setupDb(netWorths: number[], avgMonthlyExpenses = 3000) {
  const snapshotRows = netWorths.map((nw, i) => ({
    net_worth: String(nw),
    snapshot_date: `2025-${String(i + 1).padStart(2, '0')}-01`,
  }));

  mockQuery
    .mockResolvedValueOnce({ rows: snapshotRows })                               // history
    .mockResolvedValueOnce({ rows: [{ avg_exp: String(avgMonthlyExpenses) }] })  // avg expenses
    .mockResolvedValueOnce({ rows: [] });                                        // INSERT
}

afterEach(() => mockQuery.mockReset());

// ─── Typed helpers ────────────────────────────────────────────────────────────
// Avoids repeating the same mockQuery.mock.calls.find + JSON.parse boilerplate
// in every single test that needs to inspect what was persisted to the DB.

interface ScenarioPoint { month: number; netWorth: number }
interface ForecastScenarios { base: ScenarioPoint[]; optimistic: ScenarioPoint[]; pessimistic: ScenarioPoint[] }
interface ForecastSummary { fireNumber: number; monthsToFire: number | null; avgMonthlySavings: number }

function getInsertCall() {
  const call = mockQuery.mock.calls.find(
    c => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO forecast_snapshots')
  );
  expect(call).toBeDefined(); // fail fast with a clear message if missing
  return call!;
}

function getInsertedScenarios(): ForecastScenarios {
  return JSON.parse(getInsertCall()[1][1] as string);
}

function getInsertedSummary(): ForecastSummary {
  return JSON.parse(getInsertCall()[1][2] as string);
}

// ─── Not enough data ──────────────────────────────────────────────────────────

describe('runForecasting – insufficient data', () => {
  test('returns early with fewer than 5 snapshots (4 rows)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { net_worth: '10000', snapshot_date: '2025-01-01' },
        { net_worth: '10500', snapshot_date: '2025-02-01' },
        { net_worth: '11000', snapshot_date: '2025-03-01' },
        { net_worth: '11500', snapshot_date: '2025-04-01' },
      ],
    });
    await runForecasting();
    // Should NOT reach the INSERT or expense query
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('returns early with zero snapshots', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await runForecasting();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ─── Steady upward trend ──────────────────────────────────────────────────────

describe('runForecasting – steady linear growth', () => {
  // Net worth grows ~$1000/month with slight noise → sigma > 0 so scenarios diverge
  const steadyGrowth = [100_000, 101_200, 101_800, 103_100, 104_300, 105_000];

  test('runs without throwing', async () => {
    setupDb(steadyGrowth);
    await expect(runForecasting(12)).resolves.toBeUndefined();
  });

  test('inserts exactly one forecast_snapshot row', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    expect(getInsertCall()).toBeDefined();
  });

  test('saved scenarios contain base, optimistic, pessimistic keys', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    const scenarios = getInsertedScenarios();
    expect(scenarios).toHaveProperty('base');
    expect(scenarios).toHaveProperty('optimistic');
    expect(scenarios).toHaveProperty('pessimistic');
  });

  test('each scenario has the requested number of months', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    const scenarios = getInsertedScenarios();
    expect(scenarios.base).toHaveLength(12);
    expect(scenarios.optimistic).toHaveLength(12);
    expect(scenarios.pessimistic).toHaveLength(12);
  });

  test('optimistic scenario has higher final net worth than base', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    const scenarios = getInsertedScenarios();
    expect(scenarios.optimistic[11].netWorth).toBeGreaterThan(scenarios.base[11].netWorth);
  });

  test('pessimistic scenario has lower final net worth than base', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    const scenarios = getInsertedScenarios();
    expect(scenarios.pessimistic[11].netWorth).toBeLessThan(scenarios.base[11].netWorth);
  });

  test('summary includes fireNumber, monthsToFire, avgMonthlySavings', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    const summary = getInsertedSummary();
    expect(summary).toHaveProperty('fireNumber');
    expect(summary).toHaveProperty('monthsToFire');
    expect(summary).toHaveProperty('avgMonthlySavings');
  });

  test('avgMonthlySavings is approximately $1000 for a $1000/month trend', async () => {
    setupDb(steadyGrowth);
    await runForecasting(12);
    const { avgMonthlySavings } = getInsertedSummary();
    expect(avgMonthlySavings).toBeGreaterThan(800);
    expect(avgMonthlySavings).toBeLessThan(1200);
  });
});

// ─── FIRE number calculation ──────────────────────────────────────────────────

describe('runForecasting – FI/RE calculation', () => {
  test('fireNumber = 25 × 12 × avgMonthlyExpenses', async () => {
    const monthlyExpenses = 4000;
    setupDb([100_000, 101_000, 102_000, 103_000, 104_000, 105_000], monthlyExpenses);
    await runForecasting(12);
    const { fireNumber } = getInsertedSummary();
    const expected = Math.round(monthlyExpenses * 12 * 25); // 1,200,000
    expect(fireNumber).toBe(expected);
  });

  test('monthsToFire is null when net worth already exceeds FIRE number', async () => {
    // Net worth is already 2M but FIRE number would be small (expenses ≈ 0)
    setupDb(
      [2_000_000, 2_001_000, 2_002_000, 2_003_000, 2_004_000, 2_005_000],
      0 // zero expenses → fireNumber = 0, net worth > fireNumber
    );
    await runForecasting(12);
    expect(getInsertedSummary().monthsToFire).toBeNull();
  });

  test('monthsToFire is a positive integer when net worth < FIRE number', async () => {
    const monthlyExpenses = 5000;
    // Net worth ≈ $100K, FIRE number = 5000*12*25 = $1.5M → ~1400 months away
    setupDb([100_000, 101_000, 102_000, 103_000, 104_000, 105_000], monthlyExpenses);
    await runForecasting(12);
    const { monthsToFire } = getInsertedSummary();
    expect(typeof monthsToFire).toBe('number');
    expect(monthsToFire).toBeGreaterThan(0);
  });
});

// ─── Custom horizon ───────────────────────────────────────────────────────────

describe('runForecasting – custom horizon', () => {
  test('honours 24-month horizon', async () => {
    setupDb([100_000, 101_000, 102_000, 103_000, 104_000, 105_000]);
    await runForecasting(24);
    expect(getInsertCall()[1][0]).toBe(24); // horizon_months bind param
    expect(getInsertedScenarios().base).toHaveLength(24);
  });
});

// ─── Declining net worth ──────────────────────────────────────────────────────

describe('runForecasting – declining net worth', () => {
  // Net worth shrinks ~$700/month with slight noise → negative slope, sigma > 0
  const declining = [105_000, 104_200, 103_800, 102_900, 102_000, 101_500];

  test('still inserts a snapshot without throwing', async () => {
    setupDb(declining);
    await expect(runForecasting(12)).resolves.toBeUndefined();
    expect(getInsertCall()).toBeDefined();
  });

  test('pessimistic scenario ends below base scenario', async () => {
    setupDb(declining);
    await runForecasting(12);
    const scenarios = getInsertedScenarios();
    expect(scenarios.pessimistic[11].netWorth).toBeLessThan(scenarios.base[11].netWorth);
  });

  test('avgMonthlySavings is negative', async () => {
    setupDb(declining);
    await runForecasting(12);
    expect(getInsertedSummary().avgMonthlySavings).toBeLessThan(0);
  });
});

// ─── DB error tolerance ───────────────────────────────────────────────────────

describe('runForecasting – DB errors propagate', () => {
  test('throws when the history query rejects', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection refused'));
    await expect(runForecasting()).rejects.toThrow('DB connection refused');
  });
});
