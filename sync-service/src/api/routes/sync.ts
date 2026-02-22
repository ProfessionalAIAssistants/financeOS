import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { syncOFX } from '../../jobs/syncOFX';
import { runFinanceDL } from '../../jobs/runFinanceDL';
import { snapshotNetWorth } from '../../jobs/snapshotNetWorth';
import { isHealthy } from '../../firefly/client';

const router = Router();

// GET /api/sync/status
router.get('/status', async (_req: Request, res: Response) => {
  const configRes = await query(
    `SELECT institution_name, sync_method, last_sync_at, last_sync_status
     FROM institution_config ORDER BY institution_name`
  );

  const logRes = await query(
    `SELECT DISTINCT ON (institution_name) institution_name, status, transactions_added, error_message, completed_at
     FROM sync_log ORDER BY institution_name, completed_at DESC`
  );

  const logMap: Record<string, typeof logRes.rows[0]> = {};
  for (const row of logRes.rows) {
    logMap[row.institution_name] = row;
  }

  const institutions = configRes.rows.map(row => ({
    name: row.institution_name,
    method: row.sync_method,
    lastSync: row.last_sync_at,
    lastStatus: row.last_sync_status,
    lastRun: logMap[row.institution_name],
  }));

  const fireflyHealthy = await isHealthy().catch(() => false);

  res.json({
    data: {
      institutions,
      firefly: { healthy: fireflyHealthy },
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /api/sync/log
router.get('/log', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || '100');
  const institution = req.query.institution as string;

  let sql = `SELECT * FROM sync_log`;
  const params: unknown[] = [];

  if (institution) {
    sql += ` WHERE institution_name = $1`;
    params.push(institution);
  }

  sql += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);
  res.json({ data: result.rows });
});

// POST /api/sync/force
router.post('/force', async (req: Request, res: Response) => {
  const { institution } = req.body;

  res.json({ success: true, message: 'Sync started in background' });

  setImmediate(async () => {
    try {
      if (!institution || institution === 'all') {
        await syncOFX();
        await runFinanceDL(['capitalone', 'macu', 'm1finance']);
      } else if (institution === 'chase' || institution === 'usaa') {
        await syncOFX();
      } else if (['capitalone', 'macu', 'm1finance'].includes(institution)) {
        await runFinanceDL([institution]);
      }
      await snapshotNetWorth();
    } catch (err) {
      console.error('[Sync] Force sync error:', err);
    }
  });
});

// POST /api/sync/snapshot
router.post('/snapshot', async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Net worth snapshot triggered' });
  setImmediate(async () => {
    try {
      await snapshotNetWorth();
    } catch (err) {
      console.error('[Sync] Snapshot error:', err);
    }
  });
});

export default router;
