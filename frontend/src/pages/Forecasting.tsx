import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { forecastApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { fmt } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Zap, TrendingUp, ChevronDown, ChevronUp, Info } from 'lucide-react';

interface ScenarioPoint { month: number; netWorth: number; }

interface ForecastSummary {
  fireNumber: number;
  monthsToFire: number | null;
  avgMonthlySavings: number;
  monthlyVolatility?: number;
  withdrawalRate?: number;
  inflationRate?: number;
  liquidNetWorth?: number;
  illiquidNetWorth?: number;
  mc_fireProbability?: number;
  mc_monthsToFire_p10?: number | null;
  mc_monthsToFire_p50?: number | null;
  mc_monthsToFire_p90?: number | null;
  mc_sustainabilityRate?: number | null;
}

/** Deflate a nominal value by inflation to get real (purchasing-power) value. */
function toReal(nominal: number, inflationPct: number, monthsAhead: number): number {
  return nominal / Math.pow(1 + inflationPct / 100, monthsAhead / 12);
}

/**
 * Hover tooltip with bilingual text — keeps the technical label on screen but
 * explains it in plain terms when the user hovers the info icon.
 */
function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex ml-1 opacity-50 hover:opacity-100 cursor-help align-middle">
      <Info className="w-3 h-3" />
    </span>
  );
}

/** Auto-generates a plain-English summary sentence from stored forecast data. */
function buildPlainSummary(stored: ForecastSummary, liveFireNumber: number): string {
  const parts: string[] = [];

  if (stored.avgMonthlySavings > 0) {
    parts.push(`You're saving about ${fmt(stored.avgMonthlySavings)} per month.`);
  } else if (stored.avgMonthlySavings < 0) {
    parts.push(`You're spending more than you earn right now — your net worth is shrinking.`);
  }

  if (liveFireNumber > 0 && stored.liquidNetWorth != null) {
    const gap = liveFireNumber - stored.liquidNetWorth;
    if (gap <= 0) {
      parts.push(`Your liquid savings already exceed your retirement target — you could retire today!`);
    } else if (stored.monthsToFire != null && stored.monthsToFire > 0) {
      const years = Math.round(stored.monthsToFire / 12);
      parts.push(
        years < 2
          ? `At this pace you could retire in about ${stored.monthsToFire} months.`
          : `At this pace you could retire in roughly ${years} year${years === 1 ? '' : 's'}.`
      );
    }
  }

  if (stored.mc_fireProbability != null) {
    const p = stored.mc_fireProbability;
    if (p >= 70) parts.push(`Simulations look good — ${p}% of modeled futures hit your goal.`);
    else if (p >= 40) parts.push(`${p}% of simulated futures reach your goal — more savings would help.`);
    else if (p > 0) parts.push(`Only ${p}% of simulations reach your goal in this timeframe — consider a longer horizon or higher savings.`);
    else parts.push(`The goal is out of reach in this timeframe. Try a longer horizon.`);
  }

  if (parts.length === 0) return 'Generate a forecast to see your retirement timeline.';
  return parts.join(' ');
}

export function Forecasting() {
  const qc = useQueryClient();
  const [horizon, setHorizon]           = useState(12);
  const [chartMode, setChartMode]       = useState<'montecarlo' | 'scenarios'>('montecarlo');
  const [viewMode, setViewMode]         = useState<'nominal' | 'real'>('nominal');
  const [showSettings, setShowSettings] = useState(false);
  const [simpleMode, setSimpleMode]     = useState(true);   // default to Simple view

  // These are user-adjustable and recompute client-side (no regen needed)
  const [withdrawalRate, setWithdrawalRate] = useState(4.0);   // %
  const [inflationRate, setInflationRate]   = useState(3.0);   // %

  const [whatIf, setWhatIf] = useState({
    incomeChangePct: 0,
    expenseChangePct: 0,
    extraMonthlySavings: 0,
  });
  const [whatIfResult, setWhatIfResult] = useState<null | {
    baseline: Array<ScenarioPoint>;
    whatIf: Array<ScenarioPoint>;
    assumptions: Record<string, number>;
  }>(null);

  const { data: forecast, isLoading } = useQuery(['forecast', horizon], () => forecastApi.latest(horizon));

  const genMutation = useMutation({
    mutationFn: () => forecastApi.generate(horizon, withdrawalRate / 100, inflationRate / 100),
    onSuccess: () => setTimeout(() => qc.invalidateQueries({ queryKey: ['forecast'] }), 3000),
  });

  const whatIfMutation = useMutation({
    mutationFn: () => forecastApi.whatif({ ...whatIf, horizon }),
    onSuccess: (data) => setWhatIfResult(data),
  });

  if (isLoading) return <PageSpinner />;

  const scenarios = forecast?.scenarios;
  const stored    = forecast?.summary as ForecastSummary | undefined;
  const mc        = scenarios?.monteCarlo as {
    p10: ScenarioPoint[]; p25: ScenarioPoint[]; p50: ScenarioPoint[];
    p75: ScenarioPoint[]; p90: ScenarioPoint[];
  } | undefined;

  const hasMonteCarlo = !!mc?.p50?.length;

  // ── Client-side FI/RE number recalculation ──────────────────────────────
  // If user changes withdrawal rate slider, recompute instantly without regen.
  // avgMonthlyExpenses is back-computed from the stored fireNumber + stored withdrawalRate.
  const storedWithdrawalRate = stored?.withdrawalRate ?? 0.04;
  const avgMonthlyExpenses   = stored?.fireNumber
    ? (stored.fireNumber * storedWithdrawalRate) / 12
    : 0;
  const liveFireNumber = avgMonthlyExpenses > 0
    ? Math.round((avgMonthlyExpenses * 12) / (withdrawalRate / 100))
    : (stored?.fireNumber ?? 0);

  // ── Build chart data ─────────────────────────────────────────────────────
  const now        = new Date();
  const basePoints: ScenarioPoint[] = scenarios?.base ?? [];

  const applyView = (val: number | undefined, month: number) => {
    if (val == null) return undefined;
    return viewMode === 'real' ? Math.round(toReal(val, inflationRate, month)) : val;
  };

  const chartData = basePoints.map((pt, i) => {
    const d     = new Date(now.getFullYear(), now.getMonth() + pt.month, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    return {
      month:       label,
      base:        applyView(pt.netWorth, pt.month),
      optimistic:  applyView(scenarios?.optimistic?.[i]?.netWorth, pt.month),
      pessimistic: applyView(scenarios?.pessimistic?.[i]?.netWorth, pt.month),
      bestCase:    applyView(mc?.p90?.[i]?.netWorth, pt.month),
      upperMid:    applyView(mc?.p75?.[i]?.netWorth, pt.month),
      median:      applyView(mc?.p50?.[i]?.netWorth, pt.month),
      lowerMid:    applyView(mc?.p25?.[i]?.netWorth, pt.month),
      worstCase:   applyView(mc?.p10?.[i]?.netWorth, pt.month),
      whatIfVal:   applyView(whatIfResult?.whatIf?.[i]?.netWorth, pt.month),
    };
  });

  // Adjust reference line for real mode
  const refLineY = viewMode === 'real'
    ? Math.round(toReal(liveFireNumber, inflationRate, horizon / 2))
    : liveFireNumber;

  const hasFire  = stored?.mc_fireProbability != null;
  const fireProb = stored?.mc_fireProbability ?? 0;
  const sustain  = stored?.mc_sustainabilityRate;

  // MC stats are stale if user has moved slider away from stored withdrawal rate
  const mcIsStale = stored?.withdrawalRate != null &&
    Math.abs(withdrawalRate - stored.withdrawalRate * 100) > 0.1;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {[6, 12, 24, 60].map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={horizon === h
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
              }>
              {h}mo
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          {/* Simple / Advanced toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-input)' }}>
            <button onClick={() => setSimpleMode(true)}
              className="px-3 py-1.5 text-xs font-medium transition-all"
              style={simpleMode
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
              }>
              Simple
            </button>
            <button onClick={() => setSimpleMode(false)}
              className="px-3 py-1.5 text-xs font-medium transition-all"
              style={!simpleMode
                ? { background: 'var(--accent)', color: '#fff' }
                : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
              }>
              Advanced
            </button>
          </div>

          {/* Settings — Advanced only */}
          {!simpleMode && (
            <button onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
              Settings {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          <Button icon={<Zap className="w-4 h-4" />} loading={genMutation.isPending}
            onClick={() => genMutation.mutate()} variant="secondary">
            Regenerate
          </Button>
        </div>
      </div>

      {/* Advanced Settings panel — Advanced mode only */}
      {showSettings && !simpleMode && (
        <div className="glass p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Withdrawal rate */}
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
              Withdrawal Rate — {withdrawalRate.toFixed(2)}%
              <InfoTip text={
                `Safe withdrawal rate: the % of your total savings you spend each year in retirement.\n\n` +
                `In plain terms: at 4%, a $1,000,000 nest egg = $40,000/year to live on. Lower % is safer ` +
                `(money lasts longer); higher % means more annual spending but higher risk of running out.\n\n` +
                `The classic "4% rule" comes from a 1998 study (Trinity Study) and works for ~30-year retirements. ` +
                `Use 3–3.5% if you plan to retire early (40–50 year horizon).`
              } />
            </label>
            <input type="range" min="3" max="5" step="0.25" value={withdrawalRate}
              onChange={e => setWithdrawalRate(parseFloat(e.target.value))}
              className="w-full accent-blue-500" />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>3% (conservative)</span><span>5% (aggressive)</span>
            </div>
          </div>

          {/* Inflation rate */}
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
              Inflation Rate — {inflationRate.toFixed(1)}%
              <InfoTip text={
                `Expected annual inflation rate used for projections.\n\n` +
                `In plain terms: inflation means prices gradually rise over time. $100 today will buy less ` +
                `in 10 years. This setting adjusts your projections to account for that shrinkage.\n\n` +
                `The US long-run average is ~3%. Switch the chart to "Real" mode below to see your ` +
                `future numbers in today's purchasing power.`
              } />
            </label>
            <input type="range" min="0" max="6" step="0.5" value={inflationRate}
              onChange={e => setInflationRate(parseFloat(e.target.value))}
              className="w-full accent-blue-500" />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>0%</span><span>6% (high)</span>
            </div>
          </div>

          {/* Nominal / Real toggle */}
          <div>
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
              Chart Values
              <InfoTip text={
                `Nominal vs Real (inflation-adjusted) chart values.\n\n` +
                `In plain terms: "Nominal" shows future dollar amounts at face value — but $500k in 20 years ` +
                `won't buy what $500k buys today. "Real" adjusts those future numbers down to what they're ` +
                `worth in today's money, so you get an honest picture of your future purchasing power.`
              } />
            </label>
            <div className="flex gap-2">
              {(['nominal', 'real'] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={viewMode === m
                    ? { background: 'var(--accent)', color: '#fff' }
                    : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
                  }>
                  {m === 'nominal' ? 'Nominal' : `Real (${inflationRate}% inflation)`}
                </button>
              ))}
            </div>
            {viewMode === 'real' && (
              <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                Values deflated to today's purchasing power
              </p>
            )}
          </div>
        </div>
      )}

      {/* Plain-language summary — Simple mode only */}
      {simpleMode && stored && (
        <div className="glass p-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {buildPlainSummary(stored, liveFireNumber)}
          {' '}
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Switch to <strong>Advanced</strong> for detailed simulations and settings.
          </span>
        </div>
      )}

      {/* Summary stats */}
      {stored && (
        <div className={`grid gap-4 ${simpleMode ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
          {/* FI/RE Number */}
          <div className="glass p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              FI/RE Number
              <InfoTip text={
                `Your retirement savings target (FI/RE = Financial Independence / Retire Early).\n\n` +
                `In plain terms: this is the total amount you need saved up so your money works for you. ` +
                `Once you hit this number, your investments generate enough income to cover all your bills — ` +
                `you no longer need a job.\n\n` +
                `The math: annual expenses ÷ ${withdrawalRate}% = target. At 4%, you need 25× your yearly spending. ` +
                `Uses your last 12 months of average expenses.`
              } />
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {fmt(liveFireNumber)}
            </p>
            {stored.liquidNetWorth != null && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Liquid: {fmt(stored.liquidNetWorth)}
                {stored.illiquidNetWorth ? ` · Illiquid: ${fmt(stored.illiquidNetWorth)}` : ''}
              </p>
            )}
          </div>

          {/* Months to FI/RE */}
          <div className="glass p-4">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              Months to FI/RE
              <InfoTip text={
                `Estimated time until you reach your retirement target.\n\n` +
                `In plain terms: if your income, spending, and savings stay roughly the same, ` +
                `this is how many months until you cross the finish line and could retire.\n\n` +
                `This is a straight-line estimate. Switch to Advanced mode to see a range of ` +
                `possible outcomes based on 1,000 simulations.`
              } />
            </p>
            <p className="text-xl font-bold text-emerald-400">
              {stored.monthsToFire === 0 ? 'Now!' : stored.monthsToFire ?? '—'}
            </p>
            {!simpleMode && stored.mc_monthsToFire_p50 != null && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                MC median: {stored.mc_monthsToFire_p50}mo
              </p>
            )}
            {simpleMode && stored.monthsToFire != null && stored.monthsToFire > 0 && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                ≈ {Math.round(stored.monthsToFire / 12)} year{Math.round(stored.monthsToFire / 12) === 1 ? '' : 's'}
              </p>
            )}
          </div>

          {/* Advanced-only cards */}
          {!simpleMode && (
            <>
              {/* MC FI/RE Probability */}
              <div className="glass p-4" style={mcIsStale ? { opacity: 0.7 } : undefined}>
                <p className="text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  MC FI/RE Probability
                  <InfoTip text={
                    `Monte Carlo probability of reaching your FI/RE target within ${horizon} months.\n\n` +
                    `In plain terms: imagine running your financial life 1,000 times, each with random ` +
                    `good and bad luck (market ups and downs, income swings). This percentage shows how ` +
                    `many of those 1,000 futures hit your retirement target in time.\n\n` +
                    `Based on your historical net worth growth rate and month-to-month variability.`
                  } />
                  {mcIsStale && (
                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'var(--warning-subtle)', color: 'var(--warning)' }}>
                      stale
                    </span>
                  )}
                </p>
                <p className={`text-xl font-bold ${!hasFire ? '' : fireProb >= 70 ? 'text-emerald-400' : fireProb >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {hasFire ? `${fireProb}%` : '—'}
                </p>
                {stored.mc_monthsToFire_p10 != null && stored.mc_monthsToFire_p90 != null && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {stored.mc_monthsToFire_p10}–{stored.mc_monthsToFire_p90}mo range
                  </p>
                )}
              </div>

              {/* 30-year Sustainability */}
              <div className="glass p-4" style={mcIsStale ? { opacity: 0.7 } : undefined}>
                <p className="text-xs mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                  30-yr Sustainability
                  <InfoTip text={
                    `Sequence-of-returns risk: how often retirement savings survive 30 years.\n\n` +
                    `In plain terms: of the 1,000 simulated futures where you successfully retire, ` +
                    `this is the % where your money also lasts a full 30 years without running out — ` +
                    `even through bad market stretches early in retirement.\n\n` +
                    `Conservative estimate: assumes your portfolio earns 0% real return in retirement ` +
                    `(no salary; withdrawal grows with inflation). Real outcomes may be better.`
                  } />
                  {mcIsStale && (
                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'var(--warning-subtle)', color: 'var(--warning)' }}>
                      stale
                    </span>
                  )}
                </p>
                <p className={`text-xl font-bold ${sustain == null ? '' : sustain >= 85 ? 'text-emerald-400' : sustain >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {sustain != null ? `${sustain}%` : '—'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {stored.monthlyVolatility ? `±${fmt(stored.monthlyVolatility)} σ/mo` : 'post-retirement'}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Avg Monthly Savings mini-bar — Advanced only */}
      {stored && !simpleMode && (
        <div className="glass p-3 flex items-center gap-4 flex-wrap text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>
            Avg monthly savings: <strong style={{ color: 'var(--text-primary)' }}>{fmt(stored.avgMonthlySavings)}</strong>
          </span>
          {stored.monthlyVolatility != null && (
            <span style={{ color: 'var(--text-muted)' }}>
              ±{fmt(stored.monthlyVolatility)} volatility (1σ)
            </span>
          )}
          {stored.withdrawalRate && (
            <span style={{ color: 'var(--text-muted)' }}>
              MC modeled at {(stored.withdrawalRate * 100).toFixed(2)}% withdrawal
            </span>
          )}
          {mcIsStale && (
            <span className="text-xs font-medium" style={{ color: 'var(--warning)' }}>
              · Viewing at {withdrawalRate}% — MC stats are stale, Regenerate to update
            </span>
          )}
        </div>
      )}

      {/* Main chart */}
      {chartData.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>
                Net Worth Projection — {horizon} Months
                {viewMode === 'real' && <span className="ml-1 normal-case font-normal text-xs opacity-60">(real, {inflationRate}% inflation)</span>}
              </CardTitle>
              {/* Chart mode toggle — Advanced only */}
              {!simpleMode && hasMonteCarlo && (
                <div className="flex gap-1">
                  {(['montecarlo', 'scenarios'] as const).map(mode => (
                    <button key={mode} onClick={() => setChartMode(mode)}
                      className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                      style={chartMode === mode
                        ? { background: 'var(--accent)', color: '#fff' }
                        : { background: 'var(--bg-input)', color: 'var(--text-muted)' }
                      }>
                      {mode === 'montecarlo' ? 'Monte Carlo' : 'Scenarios'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
                {/* @ts-expect-error recharts formatter types */}
                <Tooltip formatter={(v: unknown, n: string) => [fmt(Number(v)), n]} contentStyle={{ background: 'var(--bg-tooltip)', border: '1px solid var(--border-strong)', borderRadius: 8 }} />
                {!simpleMode && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />}
                {liveFireNumber > 0 && (
                  <ReferenceLine y={refLineY} stroke="#34d399" strokeDasharray="4 2"
                    label={{ value: `FI/RE ${fmt(liveFireNumber)}`, fill: '#34d399', fontSize: 10 }} />
                )}

                {simpleMode ? (
                  /* Simple mode: just the median (most-likely) line */
                  <Line type="monotone" dataKey="median" name="Projected Path"
                    stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                ) : chartMode === 'scenarios' ? (
                  <>
                    <Line type="monotone" dataKey="optimistic"  name="Optimistic (+1σ)"  stroke="#34d399" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="base"        name="Base (trend)"      stroke="#60a5fa" strokeWidth={2}   dot={false} />
                    <Line type="monotone" dataKey="pessimistic" name="Pessimistic (−1σ)" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="bestCase"  name="Best Case (90th %ile)"   stroke="#34d399" strokeWidth={1}   dot={false} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="upperMid"  name="Upper Mid (75th %ile)"   stroke="#6ee7b7" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="median"    name="Median (50th %ile)"      stroke="#60a5fa" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="lowerMid"  name="Lower Mid (25th %ile)"   stroke="#fca5a5" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="worstCase" name="Worst Case (10th %ile)"  stroke="#f87171" strokeWidth={1}   dot={false} strokeDasharray="3 3" />
                  </>
                )}

                {whatIfResult && !simpleMode && (
                  <Line type="monotone" dataKey="whatIfVal" name="What-If" stroke="#fbbf24" strokeWidth={2} dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Simple mode chart footnote */}
          {simpleMode && (
            <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              The blue line is your most likely path based on past saving habits.
              {liveFireNumber > 0 && ' The green dashed line is the amount you need to retire.'}
              {' '}Switch to <strong>Advanced</strong> to see best/worst case ranges.
            </p>
          )}

          {/* Advanced MC footnote */}
          {!simpleMode && chartMode === 'montecarlo' && hasMonteCarlo && (
            <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              1,000 Monte Carlo trials — each month sampled from N(μ={fmt(stored?.avgMonthlySavings ?? 0)}, σ={fmt(stored?.monthlyVolatility ?? 0)}) based on your historical net worth changes.
              Monte Carlo runs on your <em>liquid</em> net worth only; illiquid assets (real estate, vehicles) are excluded from the target.
            </p>
          )}
        </Card>
      ) : (
        <div className="glass p-10 text-center" style={{ color: 'var(--text-muted)' }}>
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>No forecast generated yet</p>
          <ol className="text-sm text-left inline-block space-y-1 mb-5" style={{ color: 'var(--text-muted)' }}>
            <li>1. Connect an institution or upload a statement file</li>
            <li>2. Wait for the daily midnight net worth snapshot</li>
            <li>3. Return after 5 snapshots — Monte Carlo needs historical data</li>
          </ol>
          <div>
            <Button onClick={() => genMutation.mutate()} loading={genMutation.isPending}>Generate Forecast</Button>
          </div>
        </div>
      )}

      {/* What-If calculator — Advanced only */}
      {!simpleMode && (
        <Card glow="purple">
          <CardHeader><CardTitle>What-If Calculator</CardTitle></CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Income Change %</label>
              <input type="number" value={whatIf.incomeChangePct}
                onChange={e => setWhatIf(w => ({ ...w, incomeChangePct: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Expense Change %</label>
              <input type="number" value={whatIf.expenseChangePct}
                onChange={e => setWhatIf(w => ({ ...w, expenseChangePct: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Extra Monthly Savings $</label>
              <input type="number" value={whatIf.extraMonthlySavings}
                onChange={e => setWhatIf(w => ({ ...w, extraMonthlySavings: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-input)', color: 'var(--text-primary)' }} />
            </div>
          </div>
          {whatIfResult?.assumptions && (
            <div className="grid grid-cols-3 gap-3 mb-4 text-xs text-center">
              <div className="glass-sm p-3">
                <p style={{ color: 'var(--text-secondary)' }}>Adj. Monthly Income</p>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(whatIfResult.assumptions.adjustedMonthlyIncome)}</p>
              </div>
              <div className="glass-sm p-3">
                <p style={{ color: 'var(--text-secondary)' }}>Adj. Monthly Expenses</p>
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(whatIfResult.assumptions.adjustedMonthlyExpenses)}</p>
              </div>
              <div className="glass-sm p-3">
                <p style={{ color: 'var(--text-secondary)' }}>Monthly Improvement</p>
                <p className={`font-medium ${whatIfResult.assumptions.monthlyImprovementVsBaseline >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {whatIfResult.assumptions.monthlyImprovementVsBaseline >= 0 ? '+' : ''}{fmt(whatIfResult.assumptions.monthlyImprovementVsBaseline)}
                </p>
              </div>
            </div>
          )}
          <Button icon={<Zap className="w-4 h-4" />} loading={whatIfMutation.isPending}
            onClick={() => whatIfMutation.mutate()} disabled={!forecast}>
            Calculate What-If
          </Button>
        </Card>
      )}
    </div>
  );
}
