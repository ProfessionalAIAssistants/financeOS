import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { sendPushNotification } from '../../alerts/ntfy';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string || '50') || 50));
    const unreadOnly = req.query.unread === 'true';
    const severity = req.query.severity as string;
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (unreadOnly) conditions.push(`read_at IS NULL`);
    if (severity) { conditions.push(`severity = $${params.length + 1}`); params.push(severity); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit);
    const result = await query(
      `SELECT id, user_id, rule_type, severity, title, message, data, sent_at, read_at FROM alert_history ${where} ORDER BY sent_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /alerts error');
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT COUNT(*) as count FROM alert_history WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /alerts/unread-count error');
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`UPDATE alert_history SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /alerts/read-all error');
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`UPDATE alert_history SET read_at = NOW() WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /alerts/:id/read error');
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`DELETE FROM alert_history WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'DELETE /alerts/:id error');
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

router.get('/rules', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(`SELECT id, user_id, rule_type, name, threshold, account_filter, notify_push, enabled, created_at FROM alert_rules WHERE user_id = $1 ORDER BY rule_type LIMIT 100`, [userId]);
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /alerts/rules error');
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

router.post('/rules', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { ruleType, name, threshold, accountFilter, notifyPush } = req.body;
    const result = await query(
      `INSERT INTO alert_rules (user_id, rule_type, name, threshold, account_filter, notify_push)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, ruleType, name || ruleType, threshold || null, accountFilter || null, notifyPush !== false]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /alerts/rules error');
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { threshold, enabled, notifyPush, accountFilter } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (threshold !== undefined) { updates.push(`threshold = $${params.length + 1}`); params.push(threshold); }
    if (enabled !== undefined) { updates.push(`enabled = $${params.length + 1}`); params.push(enabled); }
    if (notifyPush !== undefined) { updates.push(`notify_push = $${params.length + 1}`); params.push(notifyPush); }
    if (accountFilter !== undefined) { updates.push(`account_filter = $${params.length + 1}`); params.push(accountFilter); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id, userId);
    await query(
      `UPDATE alert_rules SET ${updates.join(', ')} WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /alerts/rules/:id error');
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`DELETE FROM alert_rules WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'DELETE /alerts/rules/:id error');
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

router.post('/test', async (_req: Request, res: Response) => {
  try {
    await sendPushNotification({
      title: 'Test Alert',
      message: 'FinanceOS alerts are working! Push notifications configured correctly.',
      priority: 'default',
      tags: ['white_check_mark'],
    });
    res.json({ success: true, message: 'Test notification sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

export default router;
