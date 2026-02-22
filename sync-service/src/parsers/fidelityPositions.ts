import Papa from 'papaparse';

export interface FidelityPosition {
  symbol: string;
  description: string;
  quantity: number;
  lastPrice: number;
  currentValue: number;
  costBasis?: number;
  gainLoss?: number;
}

export function parseFidelityPositions(content: string): FidelityPosition[] {
  // Fidelity CSVs have extra header rows and a disclaimer footer
  const lines = content.split('\n');
  const headerIdx = lines.findIndex(l => l.includes('Symbol') && l.includes('Quantity'));
  if (headerIdx < 0) return [];

  const csvContent = lines.slice(headerIdx).join('\n');
  const result = Papa.parse<Record<string, string>>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  const positions: FidelityPosition[] = [];
  for (const row of result.data) {
    try {
      const symbol = (row['Symbol'] || '').trim();
      if (!symbol || symbol === 'Symbol' || symbol.startsWith('--')) continue;
      const qty        = parseFloat((row['Quantity']      || '0').replace(/[^0-9.-]/g, ''));
      const lastPrice  = parseFloat((row['Last Price']    || '0').replace(/[^0-9.$]/g, ''));
      const curVal     = parseFloat((row['Current Value'] || '0').replace(/[^0-9.-]/g, ''));
      const costBasis  = parseFloat((row['Cost Basis Total'] || '0').replace(/[^0-9.-]/g, ''));
      const gainLoss   = parseFloat((row['Total Gain/Loss Dollar'] || '0').replace(/[^0-9.-]/g, ''));

      positions.push({
        symbol,
        description: (row['Description'] || '').trim(),
        quantity: qty,
        lastPrice,
        currentValue: curVal,
        costBasis: isNaN(costBasis) ? undefined : costBasis,
        gainLoss: isNaN(gainLoss) ? undefined : gainLoss,
      });
    } catch {
      continue;
    }
  }
  return positions;
}

export function parseFidelityTransactions(content: string): Array<{ id?: string; date: string; name: string; amount: number }> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: Array<{ id?: string; date: string; name: string; amount: number }> = [];
  for (const row of result.data) {
    const dateStr = row['Date'] || row['Settlement Date'] || '';
    const desc    = row['Description'] || row['Action'] || '';
    const amtStr  = row['Amount'] || '';
    if (!dateStr || !amtStr) continue;
    const amount = parseFloat(amtStr.replace(/[^0-9.-]/g, ''));
    if (isNaN(amount)) continue;
    try {
      const date = new Date(dateStr).toISOString().split('T')[0];
      transactions.push({ date, name: desc, amount });
    } catch {
      continue;
    }
  }
  return transactions;
}
