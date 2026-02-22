import Papa from 'papaparse';

export interface M1Holding {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  value: number;
  costBasis?: number;
}

export function parseM1FinanceActivity(content: string): Array<{ id?: string; date: string; name: string; amount: number }> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .map(row => {
      const dateStr = row['Date'] || '';
      const desc    = row['Description'] || row['Type'] || '';
      const amtStr  = row['Amount'] || '';
      if (!dateStr || !amtStr) return null;
      const amount = parseFloat(amtStr.replace(/[^0-9.-]/g, ''));
      if (isNaN(amount)) return null;
      try {
        const date = new Date(dateStr).toISOString().split('T')[0];
        return { date, name: desc, amount };
      } catch {
        return null;
      }
    })
    .filter((t): t is { date: string; name: string; amount: number } => t !== null);
}

export function parseM1Holdings(content: string): M1Holding[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data
    .map(row => {
      const symbol = (row['Symbol'] || row['Ticker'] || '').trim();
      if (!symbol) return null;
      const shares = parseFloat((row['Shares'] || row['Quantity'] || '0').replace(/[^0-9.-]/g, ''));
      const price  = parseFloat((row['Price'] || row['Last Price'] || '0').replace(/[^0-9.$]/g, ''));
      const value  = parseFloat((row['Value'] || row['Market Value'] || '0').replace(/[^0-9.-]/g, ''));
      return {
        symbol,
        name: (row['Name'] || row['Description'] || symbol).trim(),
        shares,
        price,
        value,
      };
    })
    .filter((h): h is M1Holding => h !== null);
}
