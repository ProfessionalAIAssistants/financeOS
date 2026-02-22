import { Router, Request, Response } from 'express';
import { query } from '../../db/client';
import { fetchPropertyValue } from '../../assets/propertyValuation';
import { decodeVIN } from '../../assets/vinDecoder';
import { calculateAmortization } from '../../assets/amortization';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const result = await query(
    `SELECT ma.*,
       (SELECT value FROM asset_value_history WHERE asset_id = ma.id ORDER BY recorded_date DESC LIMIT 1) as latest_api_value,
       (SELECT recorded_date FROM asset_value_history WHERE asset_id = ma.id ORDER BY recorded_date DESC LIMIT 1) as latest_api_date
     FROM manual_assets ma WHERE is_active = true ORDER BY asset_type, created_at`
  );
  const assets = await Promise.all(
    result.rows.map(async (asset) => {
      if ((asset.asset_type === 'note_receivable' || asset.asset_type === 'note_payable') && asset.note_principal) {
        const pr = await query(`SELECT COUNT(*) as cnt FROM note_payments WHERE asset_id = $1`, [asset.id]);
        const paymentsMade = parseInt(pr.rows[0]?.cnt || '0');
        const amort = calculateAmortization(
          parseFloat(asset.note_principal), parseFloat(asset.note_rate || 0),
          parseInt(asset.note_term_months || 360), String(asset.note_start_date), paymentsMade
        );
        return { ...asset, amortization: {
          monthlyPayment: amort.monthlyPayment, currentBalance: amort.currentBalance,
          monthsRemaining: amort.monthsRemaining, payoffDate: amort.payoffDate,
        }};
      }
      return asset;
    })
  );
  res.json({ data: assets });
});

router.get('/:id/history', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT recorded_date, value, value_source FROM asset_value_history WHERE asset_id = $1 ORDER BY recorded_date ASC`,
    [req.params.id]
  );
  res.json({ data: result.rows });
});

router.get('/:id/amortization', async (req: Request, res: Response) => {
  const assetRes = await query(`SELECT * FROM manual_assets WHERE id = $1`, [req.params.id]);
  if (!assetRes.rows[0]) return res.status(404).json({ error: 'Not found' });
  const asset = assetRes.rows[0];
  const pr = await query(`SELECT COUNT(*) as cnt FROM note_payments WHERE asset_id = $1`, [asset.id]);
  const amort = calculateAmortization(
    parseFloat(asset.note_principal), parseFloat(asset.note_rate),
    parseInt(asset.note_term_months), String(asset.note_start_date),
    parseInt(pr.rows[0]?.cnt || '0')
  );
  res.json({ data: amort });
});

router.post('/', async (req: Request, res: Response) => {
  const {
    name, assetType, address, city, state, zip, propertyType, purchasePrice, purchaseDate,
    vin, year, make, model, trim, mileage,
    notePrincipal, noteRate, noteStartDate, noteTermMonths, noteBorrowerName, noteIsReceivable,
    notes, currentValue,
  } = req.body;

  let finalValue = parseFloat(currentValue || 0);
  let valueSource = 'manual';
  let vd: Record<string, unknown> = {};

  if (assetType === 'real_estate' && address && city && state) {
    const val = await fetchPropertyValue(address, city, state, zip);
    if (val) { finalValue = val.value; valueSource = val.source; }
  }
  if (assetType === 'vehicle' && vin) {
    const decoded = await decodeVIN(vin);
    if (decoded) vd = { year: decoded.year || year, make: decoded.make || make, model: decoded.model || model, trim: decoded.trim || trim };
  }

  const result = await query(
    `INSERT INTO manual_assets (
       name, asset_type, current_value, value_source, value_as_of,
       address, city, state, zip, property_type, purchase_price, purchase_date,
       vin, year, make, model, trim, mileage,
       note_principal, note_rate, note_start_date, note_term_months,
       note_borrower_name, note_is_receivable, notes
     ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [
      name, assetType, finalValue.toFixed(2), valueSource,
      address || null, city || null, state || null, zip || null, propertyType || null,
      purchasePrice || null, purchaseDate || null, vin || null,
      (vd as { year?: number }).year || year || null,
      (vd as { make?: string }).make || make || null,
      (vd as { model?: string }).model || model || null,
      (vd as { trim?: string }).trim || trim || null, mileage || null,
      notePrincipal || null, noteRate || null, noteStartDate || null,
      noteTermMonths || null, noteBorrowerName || null,
      noteIsReceivable !== undefined ? noteIsReceivable : true, notes || null,
    ]
  );
  if (finalValue > 0) {
    await query(
      `INSERT INTO asset_value_history (asset_id, value, value_source, recorded_date)
       VALUES ($1, $2, $3, CURRENT_DATE) ON CONFLICT DO NOTHING`,
      [result.rows[0].id, finalValue.toFixed(2), valueSource]
    );
  }
  res.status(201).json({ data: result.rows[0] });
});

router.put('/:id', async (req: Request, res: Response) => {
  const fields = req.body;
  const keys = Object.keys(fields);
  if (!keys.length) return res.status(400).json({ error: 'No fields provided' });
  const setClauses = keys.map((k, i) => `${k.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${i + 1}`);
  await query(
    `UPDATE manual_assets SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${keys.length + 1}`,
    [...Object.values(fields), req.params.id]
  );
  if (fields.currentValue) {
    await query(
      `INSERT INTO asset_value_history (asset_id, value, value_source, recorded_date)
       VALUES ($1, $2, 'manual', CURRENT_DATE)
       ON CONFLICT (asset_id, recorded_date) DO UPDATE SET value = $2, value_source = 'manual'`,
      [req.params.id, parseFloat(fields.currentValue).toFixed(2)]
    );
  }
  res.json({ success: true });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await query(`UPDATE manual_assets SET is_active = false WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
});

router.post('/:id/note-payment', async (req: Request, res: Response) => {
  const { paymentDate, amountPaid, notes: paymentNotes } = req.body;
  const assetRes = await query(`SELECT * FROM manual_assets WHERE id = $1`, [req.params.id]);
  if (!assetRes.rows[0]) return res.status(404).json({ error: 'Asset not found' });
  const asset = assetRes.rows[0];
  const pr = await query(`SELECT COUNT(*) as cnt FROM note_payments WHERE asset_id = $1`, [req.params.id]);
  const paymentsMade = parseInt(pr.rows[0]?.cnt || '0');
  const amort = calculateAmortization(
    parseFloat(asset.note_principal), parseFloat(asset.note_rate || 0),
    parseInt(asset.note_term_months || 360), String(asset.note_start_date), paymentsMade
  );
  const nextPayment = amort.schedule ? amort.schedule[paymentsMade] : undefined;
  const principalPortion = nextPayment?.principal || 0;
  const interestPortion = nextPayment?.interest || 0;
  const balanceAfter = nextPayment?.balance || 0;
  const result = await query(
    `INSERT INTO note_payments (asset_id, payment_date, amount_paid, principal_portion, interest_portion, balance_after, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.params.id, paymentDate, amountPaid,
     principalPortion.toFixed(2), interestPortion.toFixed(2), balanceAfter.toFixed(2), paymentNotes || null]
  );
  await query(
    `UPDATE manual_assets SET current_value = $1, updated_at = now() WHERE id = $2`,
    [balanceAfter.toFixed(2), req.params.id]
  );
  res.status(201).json({ data: result.rows[0] });
});

router.get('/:id/payments', async (req: Request, res: Response) => {
  const result = await query(
    `SELECT * FROM note_payments WHERE asset_id = $1 ORDER BY payment_date DESC`,
    [req.params.id]
  );
  res.json({ data: result.rows });
});

export default router;
