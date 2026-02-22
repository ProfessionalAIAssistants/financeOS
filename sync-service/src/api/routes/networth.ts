import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { snapshotNetWorth } from '../../jobs/snapshotNetWorth';

const router = Router();

router.get('/current', async (_req: Request, res: Response) => {
  const result = await query(`SELECT * FROM net_worth_snapshots ORDER BY snapshot_date DESC LIMIT 1`);
  res.json({ data: result.rows[0] || null });
});

router.get('/history', async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string || '365');
  const result = await query(
    `SELECT snapshot_date, total_assets, total_liabilities, net_worth
     FROM net_worth_snapshots
     WHERE snapshot_date >= CURRENT_DATE - $1::interval
     ORDER BY snapshot_date ASC`,
    [`${days} days`]
  );
  res.json({ data: result.rows });
});

router.get('/breakdown', async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT breakdown FROM net_worth_snapshots ORDER BY snapshot_date DESC LIMIT 1`
  );
  res.json({ data: result.rows[0]?.breakdown || {} });
});

router.post('/snapshot', async (_req: Request, res: Response) => {
  try {
    await snapshotNetWorth();
    const latest = await query(`SELECT * FROM net_worth_snapshots ORDER BY snapshot_date DESC LIMIT 1`);
    res.json({ success: true, data: latest.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Snapshot failed', details: String(err) });
  }
});

export default router;
