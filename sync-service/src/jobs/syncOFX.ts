import { downloadOFX } from '../ofx/downloader';
import { parseOFX } from '../parsers/ofxParser';
import { upsertAccount } from '../firefly/accounts';
import { upsertTransactions } from '../firefly/transactions';
import { checkForAnomalies } from '../ai/anomaly';
import { evaluateAlertRules } from '../alerts/rules';
import { query } from '../db/client';
import fs from 'fs';
import logger from '../lib/logger';

const failureCounts: Record<string, number> = {};

export async function syncOFX(): Promise<void> {
  for (const institution of ['chase', 'usaa'] as const) {
    logger.info({ institution }, 'OFX sync starting');
    const started = Date.now();

    await query(
      `INSERT INTO sync_log (institution_name, sync_method, status, started_at)
       VALUES ($1, 'ofx', 'running', now())`,
      [institution]
    ).catch(() => {});

    const result = await downloadOFX(institution, 30);

    if (!result.success || !result.files.length) {
      failureCounts[institution] = (failureCounts[institution] ?? 0) + 1;
      if (failureCounts[institution] >= 3) {
        await evaluateAlertRules({
          type: 'sync_failure',
          institution,
          description: result.error ?? 'Download failed',
        });
      }
      await query(
        `UPDATE sync_log SET status = 'error', error_message = $1, completed_at = now()
         WHERE institution_name = $2 AND status = 'running'`,
        [result.error, institution]
      ).catch(() => {});
      continue;
    }

    failureCounts[institution] = 0;
    let totalAdded = 0;

    for (const filePath of result.files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed  = parseOFX(content);

        if (!parsed.transactions.length) continue;

        const ffId = await upsertAccount(
          institution,
          parsed.accountId || institution,
          parsed.accountId || institution,
          parsed.accountType || 'checking',
          'USD',
          parsed.balance
        );

        const { added } = await upsertTransactions(institution, ffId, parsed.transactions);
        totalAdded += added;

        if (added > 0) {
          await checkForAnomalies(
            parsed.transactions.slice(0, added).map(t => ({
              id: t.id,
              description: t.name,
              amount: Math.abs(t.amount),
              date: t.date,
            }))
          );
        }

        // Archive processed file
        fs.renameSync(filePath, filePath + '.done');
      } catch (err) {
        logger.error({ filePath, err: err instanceof Error ? err.message : err }, 'OFX file processing error');
      }
    }

    await query(
      `UPDATE sync_log SET status = 'success', transactions_added = $1, completed_at = now()
       WHERE institution_name = $2 AND status = 'running'`,
      [totalAdded, institution]
    ).catch(() => {});

    await query(
      `UPDATE institution_config SET last_sync_at = now(), last_sync_status = 'success'
       WHERE institution_name = $1`,
      [institution]
    ).catch(() => {});

    logger.info({ institution, added: totalAdded, durationMs: Date.now() - started }, 'OFX sync complete');
  }
}
