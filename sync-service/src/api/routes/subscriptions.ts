import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { detectSubscriptions } from '../../ai/subscriptions';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const status = req.query.status as string || 'active';
  const params: unknown[] = [];
  let where = '';
  if (status !== 'all') { where = 'WHERE status = $1'; params.push(status); }
  const result = await query(`SELECT * FROM subscriptions ${where} ORDER BY amount DESC`, params);
  res.json({ data: result.rows });
});

router.get('/summary', async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT status, COUNT(*) as count,
       SUM(CASE WHEN frequency = 'monthly' THEN amount * 12
                WHEN frequency = 'annual' THEN amount
                WHEN frequency = 'weekly' THEN amount * 52
                ELSE amount * 12 END) as annual_cost
     FROM subscriptions GROUP BY status`
  );
  const byCategory = await query(
    `SELECT category, SUM(amount) as monthly_total, COUNT(*) as count
     FROM subscriptions WHERE status = 'active' GROUP BY category ORDER BY monthly_total DESC`
  );
  res.json({ data: { byStatus: result.rows, byCategory: byCategory.rows } });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { status, aiRecommendation, name, amount } = req.body;
  const updates: string[] = [];
  const params: unknown[] = [];
  if (status) { updates.push(`status = $${params.length + 1}`); params.push(status); }
  if (aiRecommendation) { updates.push(`ai_recommendation = $${params.length + 1}`); params.push(aiRecommendation); }
  if (name) { updates.push(`name = $${params.length + 1}`); params.push(name); }
  if (amount) { updates.push(`amount = $${params.length + 1}`); params.push(amount); }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  await query(
    `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $${params.length + 1}`,
    [...params, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await query(`DELETE FROM subscriptions WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.post('/detect', async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Detection started in background' });
  setImmediate(async () => {
    try { await detectSubscriptions(); }
    catch (err) { console.error('[Subscriptions] Error:', err); }
  });
});

export default router;
