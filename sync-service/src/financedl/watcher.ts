import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { parseOFX } from '../parsers/ofxParser';
import { parseCSV, detectInstitutionProfile } from '../parsers/csvParser';
import { parseFidelityPositions, parseFidelityTransactions } from '../parsers/fidelityPositions';
import { parseM1FinanceActivity, parseM1Holdings } from '../parsers/m1Finance';
import { upsertTransactions } from '../firefly/transactions';
import { upsertAccount } from '../firefly/accounts';
import { query } from '../db/client';
import { checkForAnomalies } from '../ai/anomaly';
import { config } from '../config';

const EXTENSIONS = ['.ofx', '.qfx', '.csv'];

const DIR_MAP: Record<string, string> = {
  chase: 'chase', usaa: 'usaa', capitalone: 'capitalone',
  macu: 'macu', m1finance: 'm1finance', m1: 'm1finance',
  fidelity: 'fidelity', manual: 'manual',
};

let watcher: ReturnType<typeof chokidar.watch> | null = null;

async function processFile(filePath: string): Promise<void> {
  const ext  = path.extname(filePath).toLowerCase();
  const dir  = path.basename(path.dirname(filePath)).toLowerCase();
  const fname = path.basename(filePath).toLowerCase();
  const institution = DIR_MAP[dir] ?? dir;

  if (!EXTENSIONS.includes(ext)) return;

  console.log(`[Watcher] ${institution}: ${path.basename(filePath)}`);

  try {
    let transactions: Array<{ id?: string; date: string; name: string; amount: number }> = [];
    let accountInfo = { id: institution, name: institution, type: 'checking' };

    if (ext === '.ofx' || ext === '.qfx') {
      const parsed = parseOFX(fs.readFileSync(filePath, 'utf-8'));
      transactions = parsed.transactions;
      accountInfo  = { id: parsed.accountId || institution, name: parsed.accountId || institution, type: parsed.accountType || 'checking' };

    } else if (ext === '.csv') {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (institution === 'fidelity') {
        if (fname.includes('position') || fname.includes('holding')) {
          parseFidelityPositions(content); // store positions
          archive(filePath); return;
        }
        transactions = parseFidelityTransactions(content);
        accountInfo  = { id: 'fidelity-brokerage', name: 'Fidelity Brokerage', type: 'investment' };
      } else if (institution === 'm1finance') {
        if (fname.includes('holding')) {
          parseM1Holdings(content);
          archive(filePath); return;
        }
        transactions = parseM1FinanceActivity(content);
        accountInfo  = { id: 'm1-invest', name: 'M1 Finance', type: 'investment' };
      } else {
        const { transactions: txns, accountInfo: ai } = parseCSV(content, detectInstitutionProfile(institution));
        transactions = txns;
        if (ai.id !== 'csv-import') accountInfo = ai;
      }
    }

    if (!transactions.length) { archive(filePath); return; }

    const ffId = await upsertAccount(institution, accountInfo.id, accountInfo.name, accountInfo.type);
    const { added } = await upsertTransactions(institution, ffId, transactions);

    if (added > 0) {
      await checkForAnomalies(transactions.slice(0, added).map(t => ({
        id: t.id ?? '', description: t.name, amount: Math.abs(t.amount), date: t.date,
      })));
    }

    await query(
      `INSERT INTO sync_log (institution_name, sync_method, status, transactions_added, completed_at)
       VALUES ($1, 'file_watch', 'success', $2, now())`,
      [institution, added]
    ).catch(() => {});

    console.log(`[Watcher] +${added} transactions`);
    archive(filePath);
  } catch (err) {
    console.error('[Watcher] Error:', err instanceof Error ? err.message : err);
  }
}

function archive(filePath: string): void {
  try {
    const dir = path.join(path.dirname(filePath), 'processed');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(filePath, path.join(dir, `${Date.now()}-${path.basename(filePath)}`));
  } catch { /* ignore */ }
}

export function startWatcher(downloadsDir = config.downloadsDir): void {
  if (watcher) return;
  if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

  watcher = chokidar.watch(downloadsDir, {
    ignored: [/(^|[/\\])\./, /processed/, /\.done$/, /\.tmp$/],
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
  });

  watcher.on('add', async (fp: string) => {
    if (EXTENSIONS.includes(path.extname(fp).toLowerCase())) {
      await new Promise(r => setTimeout(r, 1000));
      await processFile(fp);
    }
  });

  console.log(`[Watcher] Watching ${downloadsDir}`);
}

export function stopWatcher(): void {
  watcher?.close(); watcher = null;
}
