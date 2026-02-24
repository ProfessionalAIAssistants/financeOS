import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { detectSubscriptions } from '../../ai/subscriptions';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const status = req.query.status as string || 'active';
    const params: unknown[] = [userId];
    let where = 'WHERE user_id = $1';
    if (status !== 'all') { where += ' AND status = $2'; params.push(status); }
    const result = await query(`SELECT id, user_id, name, merchant, amount, frequency, category, status, next_billing_date, confidence, firefly_ids, ai_recommendation, created_at, updated_at FROM subscriptions ${where} ORDER BY amount DESC LIMIT 200`, params);
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /subscriptions error');
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT status, COUNT(*) as count,
         SUM(CASE WHEN frequency = 'monthly' THEN amount * 12
                  WHEN frequency = 'annual' THEN amount
                  WHEN frequency = 'weekly' THEN amount * 52
                  ELSE amount * 12 END) as annual_cost
       FROM subscriptions WHERE user_id = $1 GROUP BY status`,
      [userId]
    );
    const byCategory = await query(
      `SELECT category, SUM(amount) as monthly_total, COUNT(*) as count
       FROM subscriptions WHERE user_id = $1 AND status = 'active' GROUP BY category ORDER BY monthly_total DESC`,
      [userId]
    );
    res.json({ data: { byStatus: result.rows, byCategory: byCategory.rows } });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /subscriptions/summary error');
    res.status(500).json({ error: 'Failed to fetch subscription summary' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { status, aiRecommendation, name, amount } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (status) { updates.push(`status = $${params.length + 1}`); params.push(status); }
    if (aiRecommendation) { updates.push(`ai_recommendation = $${params.length + 1}`); params.push(aiRecommendation); }
    if (name) { updates.push(`name = $${params.length + 1}`); params.push(name); }
    if (amount) { updates.push(`amount = $${params.length + 1}`); params.push(amount); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id, userId);
    await query(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /subscriptions/:id error');
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`DELETE FROM subscriptions WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'DELETE /subscriptions/:id error');
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

router.post('/detect', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  res.json({ success: true, message: 'Detection started in background' });
  setImmediate(async () => {
    try { await detectSubscriptions(userId); }
    catch (err) { logger.error({ err: err instanceof Error ? err.message : err }, 'Subscription detection error'); }
  });
});

export default router;
