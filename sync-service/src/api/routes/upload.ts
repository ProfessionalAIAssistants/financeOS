import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { parseOFX } from '../../parsers/ofxParser';
import { parseCSV, detectInstitutionProfile } from '../../parsers/csvParser';
import { parseFidelityPositions, parseFidelityTransactions } from '../../parsers/fidelityPositions';
import { parseM1FinanceActivity, parseM1Holdings } from '../../parsers/m1Finance';
import { upsertTransactions } from '../../firefly/transactions';
import { upsertAccount } from '../../firefly/accounts';
import { query } from '../../db/client';
import { categorizeTransactions } from '../../ai/categorizer';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    // Sanitize filename: remove path separators and null bytes
    const safeName = file.originalname.replace(/[/\\:\0]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.ofx', '.qfx', '.csv', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) { cb(null, true); }
    else { cb(new Error(`File type ${ext} not supported`)); }
  },
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  const originalName = req.file.originalname.toLowerCase();
  const ext = path.extname(originalName);
  const institution = (req.body.institution || 'manual').toLowerCase();
  const fileType = req.body.fileType || 'auto';
  const userId = getUserId(req);
  try {
    let result: { added: number; skipped: number; institution: string };
    if (ext === '.ofx' || ext === '.qfx') {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseOFX(content);
      if (!parsed.transactions.length) {
        fs.unlinkSync(filePath);
        return res.json({ added: 0, skipped: 0, institution, message: 'No transactions found' });
      }
      const ffId = await upsertAccount(
        institution, parsed.accountId || institution + '-upload',
        parsed.accountId || institution, parsed.accountType || 'checking', 'USD', parsed.balance
      );
      const { added, skipped } = await upsertTransactions(institution, ffId, parsed.transactions);
      if (added > 0) {
        await categorizeTransactions(parsed.transactions.slice(0, added).map(t => ({
          id: t.id || '', description: t.name, amount: Math.abs(t.amount), date: t.date,
        })));
      }
      result = { added, skipped, institution };
    } else if (ext === '.csv' || ext === '.txt') {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (institution === 'fidelity' || originalName.includes('fidelity')) {
        if (fileType === 'positions' || originalName.includes('position')) {
          const positions = parseFidelityPositions(content);
          result = { added: positions.length, skipped: 0, institution: 'fidelity' };
        } else {
          const txns = parseFidelityTransactions(content);
          const ffId = await upsertAccount('fidelity', 'fidelity-brokerage', 'Fidelity Brokerage', 'investment');
          const { added, skipped } = await upsertTransactions('fidelity', ffId, txns);
          result = { added, skipped, institution: 'fidelity' };
        }
      } else if (institution === 'm1finance' || institution === 'm1' || originalName.includes('m1')) {
        if (fileType === 'positions' || originalName.includes('holding')) {
          const holdings = parseM1Holdings(content);
          result = { added: holdings.length, skipped: 0, institution: 'm1finance' };
        } else {
          const txns = parseM1FinanceActivity(content);
          const ffId = await upsertAccount('m1finance', 'm1-invest', 'M1 Finance', 'investment');
          const { added, skipped } = await upsertTransactions('m1finance', ffId, txns);
          result = { added, skipped, institution: 'm1finance' };
        }
      } else {
        const profile = detectInstitutionProfile(institution);
        const { transactions, accountInfo } = parseCSV(content, profile);
        const ffId = await upsertAccount(
          institution, accountInfo.id || institution,
          accountInfo.name || institution, accountInfo.type || 'checking'
        );
        const { added, skipped } = await upsertTransactions(institution, ffId, transactions);
        if (added > 0) {
          await categorizeTransactions(transactions.slice(0, added).map(t => ({
            id: t.id || '', description: t.name, amount: Math.abs(t.amount), date: t.date,
          })));
        }
        result = { added, skipped, institution };
      }
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Unsupported file format' });
    }
    await query(
      `INSERT INTO sync_log (user_id, institution_name, sync_method, status, transactions_added, completed_at)
       VALUES ($1, $2, 'manual_upload', 'success', $3, now())`,
      [userId, result.institution, result.added]
    );
    fs.unlinkSync(filePath);
    res.json({ success: true, ...result,
      message: `Imported ${result.added} transactions (${result.skipped} duplicates skipped)` });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    logger.error({ err: err instanceof Error ? err.message : err }, 'Upload processing error');
    res.status(500).json({ error: 'Failed to process file' });
  }
});

router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const result = await query(
      `SELECT id, user_id, institution_name, sync_method, status, transactions_added, error_message, completed_at FROM sync_log WHERE user_id = $1 AND sync_method = 'manual_upload' ORDER BY completed_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /upload/log error');
    res.status(500).json({ error: 'Failed to fetch upload log' });
  }
});

export default router;
