import Papa from 'papaparse';

export interface CSVProfile {
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  creditColumn?: string;
  debitColumn?: string;
  dateFormat?: string;
  invertAmount?: boolean;
  skipRows?: number;
}

export interface ParsedRow {
  date: Date;
  amount: number;
  description: string;
  rawDate: string;
  rawAmount: string;
  id?: string;
}

const PROFILES: Record<string, CSVProfile> = {
  CHASE:       { dateColumn: 'Transaction Date', amountColumn: 'Amount', descriptionColumn: 'Description' },
  CAPITAL_ONE: { dateColumn: 'Transaction Date', amountColumn: 'Debit', creditColumn: 'Credit', debitColumn: 'Debit', descriptionColumn: 'Description', invertAmount: true },
  USAA:        { dateColumn: 'Date', amountColumn: 'Amount', descriptionColumn: 'Description' },
  MACU:        { dateColumn: 'Date', amountColumn: 'Amount', descriptionColumn: 'Description' },
  M1_FINANCE_ACTIVITY: { dateColumn: 'Date', amountColumn: 'Amount', descriptionColumn: 'Description' },
  GENERIC_BANK: { dateColumn: 'Date', amountColumn: 'Amount', descriptionColumn: 'Description' },
};

export function detectInstitutionProfile(institution: string): CSVProfile {
  const key = institution.toUpperCase().replace(/[\s-]/g, '_');
  if (key.includes('CHASE'))   return PROFILES.CHASE;
  if (key.includes('CAPITAL')) return PROFILES.CAPITAL_ONE;
  if (key.includes('USAA'))    return PROFILES.USAA;
  if (key.includes('MACU'))    return PROFILES.MACU;
  if (key.includes('M1'))      return PROFILES.M1_FINANCE_ACTIVITY;
  return PROFILES.GENERIC_BANK;
}

function parseDate(s: string): Date {
  if (!s) return new Date();
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const parts = s.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return new Date();
}

export function parseCSV(
  content: string,
  profile: CSVProfile
): { transactions: Array<{ id?: string; date: string; name: string; amount: number }>; accountInfo: { id: string; name: string; type: string } } {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: Array<{ id?: string; date: string; name: string; amount: number }> = [];

  for (const row of result.data) {
    try {
      const rawDate = row[profile.dateColumn] || '';
      let rawAmount = row[profile.amountColumn] || '';
      const description = row[profile.descriptionColumn] || '';
      if (!rawDate || !description) continue;

      // Handle split credit/debit columns (Capital One style)
      if (profile.creditColumn && profile.debitColumn) {
        const credit = parseFloat((row[profile.creditColumn] || '0').replace(/[^0-9.-]/g, ''));
        const debit  = parseFloat((row[profile.debitColumn]  || '0').replace(/[^0-9.-]/g, ''));
        const net = credit - debit;
        rawAmount = String(net);
      }

      if (!rawAmount) continue;
      const amtNum = parseFloat(rawAmount.replace(/[^0-9.\-]/g, ''));
      if (isNaN(amtNum)) continue;
      const amount = profile.invertAmount ? -amtNum : amtNum;
      const date = parseDate(rawDate);

      transactions.push({
        date: date.toISOString().split('T')[0],
        name: description,
        amount,
      });
    } catch {
      continue;
    }
  }

  return {
    transactions,
    accountInfo: { id: 'csv-import', name: 'CSV Import', type: 'checking' },
  };
}
