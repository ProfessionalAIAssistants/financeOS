import { query } from '../db/client';
import { evaluateAlertRules } from '../alerts/rules';

interface TxInput {
  id: string;
  description: string;
  amount: number;
  date: string;
  merchantName?: string;
  category?: string;
}

export async function checkForAnomalies(transactions: TxInput[]): Promise<void> {
  for (const tx of transactions) {
    if (tx.amount <= 0) continue; // Skip income/credits

    const merchant = tx.merchantName ?? tx.description;

    // Get 90-day average for this merchant
    try {
      const hist = await query(
        `SELECT AVG(amount) as avg_amt, COUNT(*) as cnt
         FROM merchant_transaction_history
         WHERE merchant_name = $1
           AND transaction_date >= CURRENT_DATE - '90 days'::interval`,
        [merchant.toLowerCase()]
      );

      const avg  = parseFloat(hist.rows[0]?.avg_amt ?? '0');
      const cnt  = parseInt(hist.rows[0]?.cnt ?? '0');
      const isNew = cnt === 0;

      // Flag: new merchant over $100
      if (isNew && tx.amount > 100) {
        await evaluateAlertRules({
          type: 'anomaly',
          description: `New merchant: ${merchant} — $${tx.amount.toFixed(2)}`,
          amount: tx.amount,
          metadata: { merchant, isNew: true },
        });
      }

      // Flag: 2.5× above average
      if (!isNew && avg > 0 && tx.amount > avg * 2.5) {
        await evaluateAlertRules({
          type: 'anomaly',
          description: `Unusually large: ${merchant} $${tx.amount.toFixed(2)} (avg $${avg.toFixed(2)})`,
          amount: tx.amount,
          metadata: { merchant, average: avg, multiple: tx.amount / avg },
        });
      }

      // Record transaction in history
      await query(
        `INSERT INTO merchant_transaction_history (merchant_name, amount, transaction_date)
         VALUES ($1, $2, $3)`,
        [merchant.toLowerCase(), tx.amount, tx.date]
      );
    } catch {
      // DB not ready or table doesn't exist yet
    }
  }
}
