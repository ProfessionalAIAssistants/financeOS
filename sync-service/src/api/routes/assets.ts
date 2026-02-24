import { Router, Request, Response } from 'express';
import { query, transaction } from '../../db/client';
import { fetchPropertyValue } from '../../assets/propertyValuation';
import { decodeVIN } from '../../assets/vinDecoder';
import { calculateAmortization } from '../../assets/amortization';
import { getUserId } from '../../middleware/auth';
import logger from '../../lib/logger';

const router = Router();

// Allowlisted camelCase → snake_case column map to prevent SQL injection
const ALLOWED_FIELDS: Record<string, string> = {
  name: 'name', assetType: 'asset_type', currentValue: 'current_value',
  valueSource: 'value_source', valueAsOf: 'value_as_of',
  address: 'address', city: 'city', state: 'state', zip: 'zip',
  propertyType: 'property_type', purchasePrice: 'purchase_price', purchaseDate: 'purchase_date',
  linkedMortgageAccount: 'linked_mortgage_account',
  vin: 'vin', year: 'year', make: 'make', model: 'model', trim: 'trim',
  mileage: 'mileage', mileageUpdatedDate: 'mileage_updated_date',
  notePrincipal: 'note_principal', noteRate: 'note_rate', noteStartDate: 'note_start_date',
  noteTermMonths: 'note_term_months', notePaymentMonthly: 'note_payment_monthly',
  noteBorrowerName: 'note_borrower_name',
  notes: 'notes', isActive: 'is_active',
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    // Single query with JOINs — no N+1
    const result = await query(
      `SELECT ma.id, ma.user_id, ma.name, ma.asset_type, ma.current_value, ma.value_source, ma.value_as_of,
              ma.address, ma.city, ma.state, ma.zip, ma.property_type, ma.purchase_price, ma.purchase_date,
              ma.linked_mortgage_account, ma.vin, ma.year, ma.make, ma.model, ma.trim, ma.mileage, ma.mileage_updated_date,
              ma.note_principal, ma.note_rate, ma.note_start_date, ma.note_term_months, ma.note_payment_monthly,
              ma.note_borrower_name, ma.notes, ma.is_active, ma.created_at, ma.updated_at,
              avh.value as latest_api_value, avh.recorded_date as latest_api_date,
              COALESCE(np.cnt, 0) as payment_count
       FROM manual_assets ma
       LEFT JOIN LATERAL (
         SELECT value, recorded_date FROM asset_value_history WHERE asset_id = ma.id ORDER BY recorded_date DESC LIMIT 1
       ) avh ON true
       LEFT JOIN (
         SELECT asset_id, COUNT(*) as cnt FROM note_payments GROUP BY asset_id
       ) np ON np.asset_id = ma.id
       WHERE ma.is_active = true AND ma.user_id = $1
       ORDER BY ma.asset_type, ma.created_at`,
      [userId]
    );
    const assets = result.rows.map((asset) => {
      if ((asset.asset_type === 'note_receivable' || asset.asset_type === 'note_payable') && asset.note_principal) {
        const paymentsMade = parseInt(asset.payment_count || '0');
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
    });
    res.json({ data: assets });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /assets error');
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    // Verify asset ownership
    const ownerCheck = await query(`SELECT id FROM manual_assets WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    if (!ownerCheck.rows[0]) return res.status(404).json({ error: 'Not found' });
    const result = await query(
      `SELECT recorded_date, value, value_source FROM asset_value_history WHERE asset_id = $1 ORDER BY recorded_date ASC`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /assets/:id/history error');
    res.status(500).json({ error: 'Failed to fetch asset history' });
  }
});

router.get('/:id/amortization', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const assetRes = await query(
      `SELECT id, user_id, name, asset_type, current_value, value_source, value_as_of,
              note_principal, note_rate, note_start_date, note_term_months, note_payment_monthly
       FROM manual_assets WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!assetRes.rows[0]) return res.status(404).json({ error: 'Not found' });
    const asset = assetRes.rows[0];
    const pr = await query(`SELECT COUNT(*) as cnt FROM note_payments WHERE asset_id = $1`, [asset.id]);
    const amort = calculateAmortization(
      parseFloat(asset.note_principal), parseFloat(asset.note_rate),
      parseInt(asset.note_term_months), String(asset.note_start_date),
      parseInt(pr.rows[0]?.cnt || '0')
    );
    res.json({ data: amort });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /assets/:id/amortization error');
    res.status(500).json({ error: 'Failed to fetch amortization' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const {
      name, assetType, address, city, state, zip, propertyType, purchasePrice, purchaseDate,
      vin, year, make, model, trim, mileage,
      notePrincipal, noteRate, noteStartDate, noteTermMonths, noteBorrowerName, notePaymentMonthly,
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

    const result = await transaction(async (client) => {
      const assetResult = await client.query(
        `INSERT INTO manual_assets (
           user_id, name, asset_type, current_value, value_source, value_as_of,
           address, city, state, zip, property_type, purchase_price, purchase_date,
           vin, year, make, model, trim, mileage,
           note_principal, note_rate, note_start_date, note_term_months,
           note_borrower_name, note_payment_monthly, notes
         ) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING *`,
        [
          userId, name, assetType, finalValue.toFixed(2), valueSource,
          address || null, city || null, state || null, zip || null, propertyType || null,
          purchasePrice || null, purchaseDate || null, vin || null,
          (vd as { year?: number }).year || year || null,
          (vd as { make?: string }).make || make || null,
          (vd as { model?: string }).model || model || null,
          (vd as { trim?: string }).trim || trim || null, mileage || null,
          notePrincipal || null, noteRate || null, noteStartDate || null,
          noteTermMonths || null, noteBorrowerName || null, notePaymentMonthly || null,
          notes || null,
        ]
      );
      if (finalValue > 0) {
        await client.query(
          `INSERT INTO asset_value_history (asset_id, value, value_source, recorded_date)
           VALUES ($1, $2, $3, CURRENT_DATE) ON CONFLICT DO NOTHING`,
          [assetResult.rows[0].id, finalValue.toFixed(2), valueSource]
        );
      }
      return assetResult;
    });
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /assets error');
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const fields = req.body;
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: 'No fields provided' });

    // Only allow known columns (prevent SQL injection)
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const k of keys) {
      const col = ALLOWED_FIELDS[k];
      if (!col) continue; // skip unknown fields
      values.push(fields[k]);
      setClauses.push(`${col} = $${values.length}`);
    }
    if (!setClauses.length) return res.status(400).json({ error: 'No valid fields provided' });

    values.push(req.params.id, userId);
    await query(
      `UPDATE manual_assets SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values
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
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'PUT /assets/:id error');
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await query(`UPDATE manual_assets SET is_active = false WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'DELETE /assets/:id error');
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

router.post('/:id/note-payment', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { paymentDate, amountPaid, notes: paymentNotes } = req.body;
    const assetRes = await query(
      `SELECT id, user_id, name, asset_type, current_value, note_principal, note_rate, note_start_date, note_term_months
       FROM manual_assets WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
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
    const result = await transaction(async (client) => {
      const paymentResult = await client.query(
        `INSERT INTO note_payments (asset_id, payment_date, amount_paid, principal_portion, interest_portion, balance_after, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.params.id, paymentDate, amountPaid,
         principalPortion.toFixed(2), interestPortion.toFixed(2), balanceAfter.toFixed(2), paymentNotes || null]
      );
      await client.query(
        `UPDATE manual_assets SET current_value = $1, updated_at = now() WHERE id = $2 AND user_id = $3`,
        [balanceAfter.toFixed(2), req.params.id, userId]
      );
      return paymentResult;
    });
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'POST /assets/:id/note-payment error');
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

router.get('/:id/payments', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    // Verify asset ownership
    const ownerCheck = await query(`SELECT id FROM manual_assets WHERE id = $1 AND user_id = $2`, [req.params.id, userId]);
    if (!ownerCheck.rows[0]) return res.status(404).json({ error: 'Not found' });
    const result = await query(
      `SELECT id, asset_id, payment_date, amount_paid, principal_portion, interest_portion, balance_after, notes, created_at
       FROM note_payments WHERE asset_id = $1 ORDER BY payment_date DESC LIMIT 200`,
      [req.params.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, 'GET /assets/:id/payments error');
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

export default router;
