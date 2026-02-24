import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { syncOFX } from '../../jobs/syncOFX';
import { runFinanceDL } from '../../jobs/runFinanceDL';
import { snapshotNetWorth } from '../../jobs/snapshotNetWorth';
import { isHealthy } from '../../firefly/client';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

// GET /api/sync/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const configRes = await query(
      `SELECT institution_name, sync_method, last_sync_at, last_sync_status
       FROM institution_config WHERE user_id = $1 ORDER BY institution_name`,
      [userId]
    );

    const logRes = await query(
      `SELECT DISTINCT ON (institution_name) institution_name, status, transactions_added, error_message, completed_at
       FROM sync_log WHERE user_id = $1 ORDER BY institution_name, completed_at DESC`,
      [userId]
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
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /sync/status error');
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

// GET /api/sync/log
router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string || '100')));
    const institution = req.query.institution as string;

    let sql = `SELECT id, user_id, institution_name, sync_method, status, transactions_added, error_message, started_at, completed_at FROM sync_log WHERE user_id = $1`;
    const params: unknown[] = [userId];

    if (institution) {
      sql += ` AND institution_name = $${params.length + 1}`;
      params.push(institution);
    }

    sql += ` ORDER BY started_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /sync/log error');
    res.status(500).json({ error: 'Failed to fetch sync log' });
  }
});

// POST /api/sync/force
router.post('/force', async (req: Request, res: Response) => {
  const userId = getUserId(req);
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
      await snapshotNetWorth(userId);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Force sync error');
    }
  });
});

// POST /api/sync/snapshot
router.post('/snapshot', async (req: Request, res: Response) => {
  const userId = getUserId(req);
  res.json({ success: true, message: 'Net worth snapshot triggered' });
  setImmediate(async () => {
    try {
      await snapshotNetWorth(userId);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, 'Snapshot error');
    }
  });
});

export default router;
