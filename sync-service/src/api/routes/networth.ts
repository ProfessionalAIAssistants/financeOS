import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { snapshotNetWorth } from '../../jobs/snapshotNetWorth';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

router.get('/current', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT user_id, snapshot_date, total_assets, total_liabilities, net_worth, breakdown, created_at
       FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    );
    res.json({ data: result.rows[0] || null });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /networth/current error');
    res.status(500).json({ error: 'Failed to fetch current net worth' });
  }
});

router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const days = parseInt(req.query.days as string || '365');
    const result = await query(
      `SELECT snapshot_date, total_assets, total_liabilities, net_worth
       FROM net_worth_snapshots
       WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - $2::interval
       ORDER BY snapshot_date ASC`,
      [userId, `${days} days`]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /networth/history error');
    res.status(500).json({ error: 'Failed to fetch net worth history' });
  }
});

router.get('/breakdown', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT breakdown FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    );
    res.json({ data: result.rows[0]?.breakdown || {} });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /networth/breakdown error');
    res.status(500).json({ error: 'Failed to fetch breakdown' });
  }
});

router.post('/snapshot', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await snapshotNetWorth(userId);
    const latest = await query(
      `SELECT id, user_id, snapshot_date, total_assets, total_liabilities, net_worth, breakdown, created_at FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
      [userId]
    );
    res.json({ success: true, data: latest.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Snapshot failed' });
  }
});

export default router;
