import OpenAI from 'openai';
import { config } from '../config';
import { query } from '../db/client';
import { createAlert } from '../alerts/ntfy';

export async function generateMonthlyInsights(year: number, month: number): Promise<void> {
  console.log(`[Insights] Generating for ${year}-${month}`);

  // Get net worth snapshot for that month (including breakdown JSON)
  const nwRes = await query(
    `SELECT net_worth, total_assets, total_liabilities, breakdown
     FROM net_worth_snapshots
     WHERE DATE_TRUNC('month', snapshot_date) = $1
     ORDER BY snapshot_date DESC LIMIT 1`,
    [`${year}-${String(month).padStart(2, '0')}-01`]
  );

  const nw = nwRes.rows[0];
  const breakdown = nw?.breakdown as Record<string, unknown> | undefined;

  const totalIncome   = parseFloat(String(breakdown?.monthlyIncome   ?? breakdown?.totalIncome   ?? '0'));
  const totalExpenses = parseFloat(String(breakdown?.monthlyExpenses ?? breakdown?.totalExpenses ?? '0'));
  const savingsRate   = totalIncome > 0
    ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)
    : 0;

  const stats = {
    netWorth:         parseFloat(nw?.net_worth         ?? '0'),
    totalAssets:      parseFloat(nw?.total_assets      ?? '0'),
    totalLiabilities: parseFloat(nw?.total_liabilities ?? '0'),
    totalIncome,
    totalExpenses,
    savingsRate,
  };

  let narrative = '';

  if (config.openaiApiKey) {
    try {
      const openai = new OpenAI({ apiKey: config.openaiApiKey });
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a personal finance advisor. Write a concise, encouraging monthly financial summary in 3-4 sentences. Focus on trends, savings rate, and actionable insights.',
          },
          {
            role: 'user',
            content: [
              `Month: ${year}-${String(month).padStart(2, '0')}`,
              `Net Worth: $${stats.netWorth.toLocaleString()}`,
              `Assets: $${stats.totalAssets.toLocaleString()}`,
              `Liabilities: $${stats.totalLiabilities.toLocaleString()}`,
              `Monthly Income: $${stats.totalIncome.toLocaleString()}`,
              `Monthly Expenses: $${stats.totalExpenses.toLocaleString()}`,
              `Savings Rate: ${stats.savingsRate}%`,
            ].join('\n'),
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });
      narrative = resp.choices[0].message.content ?? '';
    } catch (err) {
      console.error('[Insights] OpenAI error:', err instanceof Error ? err.message : err);
    }
  }

  if (!narrative) {
    const savedAmt = stats.totalIncome - stats.totalExpenses;
    narrative = `Your net worth stands at $${stats.netWorth.toLocaleString()} with $${stats.totalAssets.toLocaleString()} in assets and $${stats.totalLiabilities.toLocaleString()} in liabilities. `
      + (stats.totalIncome > 0
        ? `This month you earned $${stats.totalIncome.toLocaleString()} and spent $${stats.totalExpenses.toLocaleString()}, saving $${savedAmt.toLocaleString()} (${stats.savingsRate}% savings rate). `
        : '')
      + 'Keep tracking your progress!';
  }

  await createAlert({
    title: `📊 Monthly Insights — ${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}`,
    message: narrative,
    priority: 'low',
    tags: ['bar_chart'],
    ruleType: 'monthly_insights',
    severity: 'info',
    metadata: { stats, narrative },
  }, true);

  console.log('[Insights] Done');
}
