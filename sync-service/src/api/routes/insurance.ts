import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { config } from '../../config';
import { getUserId } from '../../middleware/auth';
import OpenAI from 'openai';
import logger from '../../lib/logger';

const router = Router();

// Allowlisted camelCase → snake_case column map to prevent SQL injection
const ALLOWED_FIELDS: Record<string, string> = {
  policyType: 'policy_type', provider: 'provider', policyNumber: 'policy_number',
  insuredName: 'insured_name', coverageAmount: 'coverage_amount', premiumAmount: 'premium_amount',
  premiumFrequency: 'premium_frequency', deductible: 'deductible', renewalDate: 'renewal_date',
  startDate: 'start_date', notes: 'notes', isActive: 'is_active',
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(`SELECT id, user_id, policy_type, provider, policy_number, insured_name, coverage_amount, premium_amount, premium_frequency, deductible, renewal_date, start_date, notes, is_active, ai_review, created_at, updated_at FROM insurance_policies WHERE user_id = $1 ORDER BY policy_type, provider LIMIT 200`, [userId]);
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insurance error');
    res.status(500).json({ error: 'Failed to fetch insurance policies' });
  }
});

router.get('/summary/annual-cost', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT policy_type,
         SUM(CASE WHEN premium_frequency = 'monthly' THEN premium_amount * 12
                  WHEN premium_frequency = 'annual' THEN premium_amount
                  ELSE premium_amount * 12 END) as annual_cost
       FROM insurance_policies WHERE user_id = $1 GROUP BY policy_type`,
      [userId]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insurance/summary error');
    res.status(500).json({ error: 'Failed to fetch annual cost summary' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT id, user_id, policy_type, provider, policy_number, insured_name, coverage_amount, premium_amount,
              premium_frequency, deductible, renewal_date, start_date, notes, ai_review, is_active, created_at, updated_at
       FROM insurance_policies WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /insurance/:id error');
    res.status(500).json({ error: 'Failed to fetch policy' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { policyType, provider, policyNumber, coverageAmount, premiumAmount,
            premiumFrequency, deductible, renewalDate, notes } = req.body;
    const result = await query(
      `INSERT INTO insurance_policies (user_id, policy_type, provider, policy_number, coverage_amount, premium_amount,
        premium_frequency, deductible, renewal_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [userId, policyType, provider, policyNumber || null, coverageAmount || null, premiumAmount || null,
       premiumFrequency || 'monthly', deductible || null, renewalDate || null, notes || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /insurance error');
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const fields = req.body;
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: 'No fields provided' });

    // Only allow known columns (prevent SQL injection)
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const k of keys) {
      const col = ALLOWED_FIELDS[k];
      if (!col) continue;
      values.push(fields[k]);
      setClauses.push(`${col} = $${values.length}`);
    }
    if (!setClauses.length) return res.status(400).json({ error: 'No valid fields provided' });

    values.push(req.params.id, userId);
    await query(
      `UPDATE insurance_policies SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /insurance/:id error');
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`DELETE FROM insurance_policies WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'DELETE /insurance/:id error');
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

router.post('/:id/ai-review', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const policyRes = await query(
      `SELECT id, user_id, policy_type, provider, policy_number, insured_name, coverage_amount, premium_amount,
              premium_frequency, deductible, renewal_date, start_date, notes, ai_review, is_active, created_at, updated_at
       FROM insurance_policies WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!policyRes.rows[0]) return res.status(404).json({ error: 'Policy not found' });
    const policy = policyRes.rows[0];
    const nwRes = await query(
      `SELECT net_worth, total_assets FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    );
    const nw = nwRes.rows[0];

    let assetContext = '';
    if (policy.policy_type === 'home') {
      const rows = await query(
        `SELECT name, current_value, address FROM manual_assets WHERE asset_type = 'real_estate' AND is_active = true AND user_id = $1`,
        [userId]
      );
      if (rows.rows.length) assetContext = 'Real estate: ' + rows.rows.map((a: { name: string; current_value: string; address: string }) => `${a.name}: $${a.current_value} (${a.address})`).join(', ');
    } else if (policy.policy_type === 'auto') {
      const rows = await query(
        `SELECT name, current_value, year, make, model FROM manual_assets WHERE asset_type = 'vehicle' AND is_active = true AND user_id = $1`,
        [userId]
      );
      if (rows.rows.length) assetContext = 'Vehicles: ' + rows.rows.map((v: { year: number; make: string; model: string; current_value: string }) => `${v.year} ${v.make} ${v.model}: $${v.current_value}`).join(', ');
    }

    let review = '';
    if (config.openaiApiKey) {
      try {
        const openai = new OpenAI({ apiKey: config.openaiApiKey });
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a personal finance insurance advisor. Provide concise, actionable insurance coverage analysis in 2-3 paragraphs.' },
            { role: 'user', content: `Review this insurance policy:\nType: ${policy.policy_type}\nProvider: ${policy.provider}\nCoverage: $${policy.coverage_amount}\nPremium: $${policy.premium_amount}/${policy.premium_frequency}\nDeductible: $${policy.deductible}\nRenewal: ${policy.renewal_date}\n\nNet Worth: $${nw?.net_worth || 'unknown'}\nAssets: $${nw?.total_assets || 'unknown'}\n${assetContext}\n\nProvide coverage adequacy analysis and 2-3 specific recommendations.` },
          ],
          max_tokens: 500,
          temperature: 0.4,
        });
        review = resp.choices[0].message.content || '';
      } catch (err) {
        logger.error({ err: err instanceof Error ? err.message : err }, 'AI review generation error');
      }
    }

    if (!review) {
      const coverage = parseFloat(policy.coverage_amount || '0');
      const netWorth = parseFloat(nw?.net_worth || '0');
      const reviews: string[] = [];
      if (policy.policy_type === 'life' && coverage < netWorth * 0.5) reviews.push(`Your life insurance coverage of $${coverage.toLocaleString()} may be insufficient. Consider 5-10x annual income.`);
      if (policy.policy_type === 'umbrella' && coverage < netWorth) reviews.push(`Your umbrella policy of $${coverage.toLocaleString()} is less than your net worth. Consider increasing.`);
      if (policy.renewal_date) {
        const days = Math.ceil((new Date(policy.renewal_date).getTime() - Date.now()) / 86400000);
        if (days < 60) reviews.push(`Your ${policy.policy_type} policy renews in ${days} days. Consider shopping rates.`);
      }
      review = reviews.join('\n\n') || `Your ${policy.policy_type} policy with ${policy.provider} appears adequate. Review annually.`;
    }

    await query(`UPDATE insurance_policies SET ai_review = $1, updated_at = now() WHERE id = $2 AND user_id = $3`, [review, req.params.id, userId]);
    res.json({ data: { review, policy: { ...policy, ai_review: review } } });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /insurance/:id/ai-review error');
    res.status(500).json({ error: 'Failed to generate AI review' });
  }
});

export default router;
