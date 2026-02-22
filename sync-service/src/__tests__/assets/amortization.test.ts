import { calculateAmortization } from '../../assets/amortization';

// ─── Fixtures ──────────────────────────────────────────────────────────────
// 30-year fixed mortgage: $300,000 @ 7% APR, originated 2020-01-01
const PRINCIPAL   = 300_000;
const ANNUAL_RATE = 7;
const TERM        = 360; // 30 years
const START_DATE  = '2020-01-01';

// Expected monthly payment (standard formula):
// r = 0.07/12 = 0.005833..., n = 360
// M = 300000 * (r(1+r)^n) / ((1+r)^n - 1) ≈ $1,995.91
const EXPECTED_MONTHLY = 1995.91;

describe('calculateAmortization – basic mortgage', () => {
  let result: ReturnType<typeof calculateAmortization>;
  beforeAll(() => {
    result = calculateAmortization(PRINCIPAL, ANNUAL_RATE, TERM, START_DATE, 0);
  });

  test('computes correct monthly payment', () => {
    expect(result.monthlyPayment).toBeCloseTo(EXPECTED_MONTHLY, 0);
  });

  test('monthlyPayment is a positive number', () => {
    expect(result.monthlyPayment).toBeGreaterThan(0);
  });

  test('currentBalance equals principal when 0 payments made', () => {
    expect(result.currentBalance).toBeCloseTo(PRINCIPAL, 0);
  });

  test('totalPaid is 0 when 0 payments made', () => {
    expect(result.totalPaid).toBe(0);
  });

  test('totalInterestPaid is 0 when 0 payments made', () => {
    expect(result.totalInterestPaid).toBe(0);
  });

  test('monthsRemaining equals full term when 0 payments made', () => {
    expect(result.monthsRemaining).toBe(TERM);
  });

  test('payoffDate is 30 years after start', () => {
    expect(result.payoffDate).toBe('2050-01-01');
  });

  test('no schedule returned when includeSchedule is false', () => {
    expect(result.schedule).toBeUndefined();
  });
});

describe('calculateAmortization – with payments made', () => {
  const PAYMENTS_MADE = 60; // 5 years in
  let result: ReturnType<typeof calculateAmortization>;
  beforeAll(() => {
    result = calculateAmortization(PRINCIPAL, ANNUAL_RATE, TERM, START_DATE, PAYMENTS_MADE);
  });

  test('currentBalance is less than principal after payments', () => {
    expect(result.currentBalance).toBeLessThan(PRINCIPAL);
  });

  test('currentBalance is positive after 60 payments', () => {
    expect(result.currentBalance).toBeGreaterThan(0);
  });

  test('totalPaid equals monthlyPayment × paymentsMade', () => {
    expect(result.totalPaid).toBeCloseTo(result.monthlyPayment * PAYMENTS_MADE, 0);
  });

  test('totalInterestPaid is positive', () => {
    expect(result.totalInterestPaid).toBeGreaterThan(0);
  });

  test('monthsRemaining = term - paymentsMade', () => {
    expect(result.monthsRemaining).toBe(TERM - PAYMENTS_MADE);
  });

  test('total interest is less than total paid', () => {
    expect(result.totalInterestPaid).toBeLessThan(result.totalPaid);
  });
});

describe('calculateAmortization – 0% interest rate', () => {
  // Edge case: interest-free loan
  let result: ReturnType<typeof calculateAmortization>;
  beforeAll(() => {
    result = calculateAmortization(12_000, 0, 12, '2025-01-01', 0);
  });

  test('monthly payment equals principal / term for 0% rate', () => {
    expect(result.monthlyPayment).toBeCloseTo(1000, 0);
  });

  test('currentBalance equals principal when 0 payments', () => {
    expect(result.currentBalance).toBeCloseTo(12_000, 0);
  });
});

describe('calculateAmortization – full schedule', () => {
  let result: ReturnType<typeof calculateAmortization>;
  beforeAll(() => {
    result = calculateAmortization(10_000, 5, 12, '2025-01-01', 0, true);
  });

  test('schedule is an array', () => {
    expect(Array.isArray(result.schedule)).toBe(true);
  });

  test('schedule has correct number of entries', () => {
    expect(result.schedule!.length).toBeLessThanOrEqual(12);
    expect(result.schedule!.length).toBeGreaterThan(0);
  });

  test('first payment has correct month number', () => {
    expect(result.schedule![0].month).toBe(1);
  });

  test('schedule entries sum of principal ≈ original principal', () => {
    const totalPrincipal = result.schedule!.reduce((sum, p) => sum + p.principal, 0);
    expect(totalPrincipal).toBeCloseTo(10_000, 0);
  });

  test('balance decreases monotonically', () => {
    const balances = result.schedule!.map(p => p.balance);
    for (let i = 1; i < balances.length; i++) {
      expect(balances[i]).toBeLessThanOrEqual(balances[i - 1]);
    }
  });

  test('last payment leaves balance at 0 (or near 0)', () => {
    const last = result.schedule![result.schedule!.length - 1];
    expect(last.balance).toBeCloseTo(0, 1);
  });

  test('each payment entry has required fields', () => {
    const entry = result.schedule![0];
    expect(entry).toHaveProperty('month');
    expect(entry).toHaveProperty('payment');
    expect(entry).toHaveProperty('principal');
    expect(entry).toHaveProperty('interest');
    expect(entry).toHaveProperty('balance');
    expect(entry).toHaveProperty('date');
  });

  test('payment = principal + interest (within rounding)', () => {
    for (const p of result.schedule!.slice(0, -1)) {
      expect(p.payment).toBeCloseTo(p.principal + p.interest, 1);
    }
  });

  test('date field is in YYYY-MM-DD format', () => {
    for (const p of result.schedule!) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('calculateAmortization – auto-calculate payments from start date', () => {
  // paymentsMadeCount is omitted — derived dynamically from START_DATE to today
  let result: ReturnType<typeof calculateAmortization>;
  beforeAll(() => {
    result = calculateAmortization(300_000, 7, 360, '2020-01-01');
  });

  test('currentBalance is less than principal (some payments inferred)', () => {
    expect(result.currentBalance).toBeLessThan(300_000);
  });

  test('monthsRemaining is less than full term', () => {
    expect(result.monthsRemaining).toBeLessThan(360);
  });
});

describe('calculateAmortization – edge: already paid off', () => {
  let result: ReturnType<typeof calculateAmortization>;
  beforeAll(() => {
    result = calculateAmortization(1_000, 5, 12, '2023-01-01', 12);
  });

  test('currentBalance is 0 when all payments made', () => {
    expect(result.currentBalance).toBeCloseTo(0, 1);
  });

  test('monthsRemaining is 0', () => {
    expect(result.monthsRemaining).toBe(0);
  });
});
