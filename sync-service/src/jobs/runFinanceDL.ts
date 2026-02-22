import { spawn } from 'child_process';
import path from 'path';
import { query } from '../db/client';
import { evaluateAlertRules } from '../alerts/rules';

export async function runFinanceDL(institutions: string[] = ['capitalone', 'macu', 'm1finance']): Promise<void> {
  for (const inst of institutions) {
    console.log(`[finance-dl] Running for ${inst}...`);
    await query(
      `INSERT INTO sync_log (institution_name, sync_method, status, started_at)
       VALUES ($1, 'finance_dl', 'running', now())`,
      [inst]
    ).catch(() => {});

    const success = await runForInstitution(inst);

    await query(
      `UPDATE sync_log SET status = $1, completed_at = now()
       WHERE institution_name = $2 AND status = 'running'`,
      [success ? 'success' : 'error', inst]
    ).catch(() => {});

    if (!success) {
      await evaluateAlertRules({
        type: 'sync_failure',
        institution: inst,
        description: `finance-dl failed for ${inst}`,
      });
    }
  }
}

function runForInstitution(institution: string): Promise<boolean> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../financedl/config.py');
    const proc = spawn('python3', [scriptPath, '--institutions', institution], {
      env: { ...process.env },
      timeout: 300000, // 5 minutes
    });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      console.error(`[finance-dl] ${institution} timed out`);
      resolve(false);
    }, 300000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error(`[finance-dl] ${institution} exit ${code}: ${stderr}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
