import OpenAI from 'openai';
import { config } from '../config';
import { query } from '../db/client';
import { createAlert } from '../alerts/ntfy';

export async function generateMonthlyInsights(year: number, month: number): Promise<void> {
  console.log(`[Insights] Generating for ${year}-${month}`);

  // Get net worth snapshot for that month
  const nwRes = await query(
    `SELECT net_worth, total_assets, total_liabilities, breakdown
     FROM net_worth_snapshots
     WHERE DATE_TRUNC('month', snapshot_date) = $1
     ORDER BY snapshot_date DESC LIMIT 1`,
    [`${year}-${String(month).padStart(2, '0')}-01`]
  );

  const nw = nwRes.rows[0];
  const stats = {
    netWorth: parseFloat(nw?.net_worth ?? '0'),
    totalAssets: parseFloat(nw?.total_assets ?? '0'),
    totalLiabilities: parseFloat(nw?.total_liabilities ?? '0'),
    totalIncome: 0,
    totalExpenses: 0,
    savingsRate: 0,
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
            content: 'You are a personal finance advisor. Write a concise, encouraging monthly financial summary in 3-4 sentences. Focus on trends and actionable insights.',
          },
          {
            role: 'user',
            content: `Month: ${year}-${month}\nNet Worth: $${stats.netWorth.toLocaleString()}\nAssets: $${stats.totalAssets.toLocaleString()}\nLiabilities: $${stats.totalLiabilities.toLocaleString()}`,
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
    narrative = `Your net worth stands at $${stats.netWorth.toLocaleString()} with $${stats.totalAssets.toLocaleString()} in assets and $${stats.totalLiabilities.toLocaleString()} in liabilities. Keep tracking your progress!`;
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
