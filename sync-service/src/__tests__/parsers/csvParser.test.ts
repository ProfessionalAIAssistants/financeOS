import { parseCSV, detectInstitutionProfile, CSVProfile } from '../../parsers/csvParser';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const chaseCsv = `Transaction Date,Post Date,Description,Category,Type,Amount,Memo
01/10/2026,01/11/2026,AMAZON MARKETPLACE,Shopping,Sale,-45.99,
01/05/2026,01/06/2026,EMPLOYER PAYROLL,Income,Payment,3500.00,
01/08/2026,01/09/2026,NETFLIX,Entertainment,Sale,-15.99,
01/07/2026,01/08/2026,SHELL GAS STATION,Gas,Sale,-52.10,
01/03/2026,01/04/2026,WHOLE FOODS MARKET,Groceries,Sale,-89.40,`;

const capitalOneCsv = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-01-10,2026-01-11,,STARBUCKS,Dining,6.50,
2026-01-05,2026-01-06,,PAYROLL,Income,,3500.00
2026-01-08,2026-01-09,,NETFLIX,Entertainment,15.99,`;

const genericCsv = `Date,Amount,Description
2026-01-10,-45.99,AMAZON
2026-01-05,3500.00,SALARY
2026-01-08,-15.99,SPOTIFY`;

const malformedCsv = `Date,Amount,Description
,not-a-number,BADROW
2026-01-01,-10.00,VALID ROW
,,-
2026-01-02,0,ZERO AMOUNT`;

// ─── detectInstitutionProfile ─────────────────────────────────────────────

describe('detectInstitutionProfile', () => {
  test('detects Chase by name', () => {
    const p = detectInstitutionProfile('Chase Checking');
    expect(p.descriptionColumn).toBe('Description');
    expect(p.dateColumn).toBe('Transaction Date');
  });

  test('detects Capital One by name', () => {
    const p = detectInstitutionProfile('Capital One Venture');
    expect(p.creditColumn).toBe('Credit');
    expect(p.debitColumn).toBe('Debit');
    expect(p.invertAmount).toBe(true);
  });

  test('detects USAA by name', () => {
    const p = detectInstitutionProfile('USAA Bank');
    expect(p.dateColumn).toBe('Date');
  });

  test('detects MACU by name', () => {
    const p = detectInstitutionProfile('MACU Savings');
    expect(p.dateColumn).toBe('Date');
  });

  test('detects M1 Finance by name', () => {
    const p = detectInstitutionProfile('M1 Finance Activity');
    expect(p.amountColumn).toBe('Amount');
  });

  test('falls back to GENERIC_BANK for unknown institution', () => {
    const p = detectInstitutionProfile('Unknown Credit Union');
    expect(p.dateColumn).toBe('Date');
  });

  test('is case-insensitive', () => {
    const p = detectInstitutionProfile('chase bank');
    expect(p.dateColumn).toBe('Transaction Date');
  });
});

// ─── parseCSV – Chase format ─────────────────────────────────────────────

describe('parseCSV – Chase profile', () => {
  const profile: CSVProfile = detectInstitutionProfile('Chase');
  let result: ReturnType<typeof parseCSV>;

  beforeAll(() => {
    result = parseCSV(chaseCsv, profile);
  });

  test('parses all non-empty rows', () => {
    expect(result.transactions).toHaveLength(5);
  });

  test('parses negative amount (debit)', () => {
    const amazon = result.transactions.find(t => t.name === 'AMAZON MARKETPLACE');
    expect(amazon).toBeDefined();
    expect(amazon!.amount).toBeCloseTo(-45.99);
  });

  test('parses positive amount (credit)', () => {
    const payroll = result.transactions.find(t => t.name === 'EMPLOYER PAYROLL');
    expect(payroll).toBeDefined();
    expect(payroll!.amount).toBeCloseTo(3500);
  });

  test('formats dates as YYYY-MM-DD', () => {
    const amazon = result.transactions.find(t => t.name === 'AMAZON MARKETPLACE');
    expect(amazon!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(amazon!.date).toBe('2026-01-10');
  });

  test('returns accountInfo with csv-import id', () => {
    expect(result.accountInfo.id).toBe('csv-import');
  });

  test('all amounts are finite numbers', () => {
    for (const tx of result.transactions) {
      expect(isFinite(tx.amount)).toBe(true);
    }
  });
});

// ─── parseCSV – Capital One (split debit/credit) ──────────────────────────

describe('parseCSV – Capital One profile (split credit/debit columns)', () => {
  const profile: CSVProfile = detectInstitutionProfile('Capital One');
  let result: ReturnType<typeof parseCSV>;

  beforeAll(() => {
    result = parseCSV(capitalOneCsv, profile);
  });

  test('parses 3 transactions', () => {
    expect(result.transactions).toHaveLength(3);
  });

  test('debit-only row results in positive amount (debit=6.50 → net=-6.50 → invert=+6.50)', () => {
    const starbucks = result.transactions.find(t => t.name === 'STARBUCKS');
    expect(starbucks).toBeDefined();
    // net = credit(0) - debit(6.50) = -6.50; invertAmount flips sign → +6.50
    expect(starbucks!.amount).toBeCloseTo(6.50);
  });

  test('credit-only row results in negative amount (credit=3500 → net=+3500 → invert=-3500)', () => {
    const payroll = result.transactions.find(t => t.name === 'PAYROLL');
    expect(payroll).toBeDefined();
    // net = credit(3500) - debit(0) = +3500; invertAmount flips sign → -3500
    expect(payroll!.amount).toBeCloseTo(-3500);
  });
});

// ─── parseCSV – Generic format ────────────────────────────────────────────

describe('parseCSV – generic profile', () => {
  const profile: CSVProfile = detectInstitutionProfile('My Local Bank');
  let result: ReturnType<typeof parseCSV>;

  beforeAll(() => {
    result = parseCSV(genericCsv, profile);
  });

  test('parses all 3 rows', () => {
    expect(result.transactions).toHaveLength(3);
  });

  test('parses ISO date (YYYY-MM-DD)', () => {
    const amazon = result.transactions.find(t => t.name === 'AMAZON');
    expect(amazon!.date).toBe('2026-01-10');
  });
});

// ─── parseCSV – malformed / edge-case rows ────────────────────────────────

describe('parseCSV – malformed rows are skipped gracefully', () => {
  const profile: CSVProfile = detectInstitutionProfile('Generic');

  test('skips row with non-numeric amount and row with empty description', () => {
    const result = parseCSV(malformedCsv, profile);
    // Only "VALID ROW" and "ZERO AMOUNT" have valid dates; "not-a-number" is skipped
    const names = result.transactions.map(t => t.name);
    expect(names).not.toContain('BADROW');
    expect(names).toContain('VALID ROW');
  });

  test('does not throw on malformed input', () => {
    expect(() => parseCSV(malformedCsv, profile)).not.toThrow();
  });

  test('handles empty CSV string', () => {
    const result = parseCSV('', profile);
    expect(result.transactions).toHaveLength(0);
  });

  test('handles CSV with header only (no data rows)', () => {
    const result = parseCSV('Date,Amount,Description\n', profile);
    expect(result.transactions).toHaveLength(0);
  });
});
