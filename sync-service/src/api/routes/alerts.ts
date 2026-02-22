import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { sendPushNotification } from '../../alerts/ntfy';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || '50');
  const unreadOnly = req.query.unread === 'true';
  const severity = req.query.severity as string;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (unreadOnly) conditions.push(`read = false`);
  if (severity) { conditions.push(`severity = $${params.length + 1}`); params.push(severity); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const result = await query(
    `SELECT * FROM alert_history ${where} ORDER BY sent_at DESC LIMIT $${params.length}`,
    params
  );
  res.json({ data: result.rows });
});

router.get('/unread-count', async (_req: Request, res: Response) => {
  const result = await query(`SELECT COUNT(*) as count FROM alert_history WHERE read = false`);
  res.json({ count: parseInt(result.rows[0].count) });
});

router.put('/read-all', async (_req: Request, res: Response) => {
  await query(`UPDATE alert_history SET read = true WHERE read = false`);
  res.json({ success: true });
});

router.put('/:id/read', async (req: Request, res: Response) => {
  await query(`UPDATE alert_history SET read = true WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await query(`DELETE FROM alert_history WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.get('/rules', async (_req: Request, res: Response) => {
  const result = await query(`SELECT * FROM alert_rules ORDER BY rule_type`);
  res.json({ data: result.rows });
});

router.post('/rules', async (req: Request, res: Response) => {
  const { ruleType, threshold, accountFilter, notifyPush } = req.body;
  const result = await query(
    `INSERT INTO alert_rules (rule_type, threshold, account_filter, notify_push)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [ruleType, threshold || null, accountFilter || null, notifyPush !== false]
  );
  res.status(201).json({ data: result.rows[0] });
});

router.put('/rules/:id', async (req: Request, res: Response) => {
  const { threshold, enabled, notifyPush, accountFilter } = req.body;
  const updates: string[] = [];
  const params: unknown[] = [];
  if (threshold !== undefined) { updates.push(`threshold = $${params.length + 1}`); params.push(threshold); }
  if (enabled !== undefined) { updates.push(`enabled = $${params.length + 1}`); params.push(enabled); }
  if (notifyPush !== undefined) { updates.push(`notify_push = $${params.length + 1}`); params.push(notifyPush); }
  if (accountFilter !== undefined) { updates.push(`account_filter = $${params.length + 1}`); params.push(accountFilter); }
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  await query(
    `UPDATE alert_rules SET ${updates.join(', ')} WHERE id = $${params.length + 1}`,
    [...params, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/rules/:id', async (req: Request, res: Response) => {
  await query(`DELETE FROM alert_rules WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
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
    res.status(500).json({ error: 'Failed to send test notification', details: String(err) });
  }
});

export default router;
