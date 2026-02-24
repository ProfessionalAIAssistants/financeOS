/**
 * Tests for M1 Finance parser.
 */

import { parseM1FinanceActivity, parseM1Holdings } from '../../parsers/m1Finance';

describe('parseM1FinanceActivity', () => {
  test('parses activity rows', () => {
    const csv = [
      'Date,Description,Amount',
      '01/15/2025,Buy VTI,-500.00',
      '01/10/2025,Dividend,12.50',
    ].join('\n');

    const txns = parseM1FinanceActivity(csv);

    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      date: '2025-01-15',
      name: 'Buy VTI',
      amount: -500,
    });
    expect(txns[1]).toMatchObject({
      date: '2025-01-10',
      name: 'Dividend',
      amount: 12.5,
    });
  });

  test('uses Type column as fallback for description', () => {
    const csv = [
      'Date,Type,Amount',
      '01/15/2025,Deposit,1000.00',
    ].join('\n');

    const txns = parseM1FinanceActivity(csv);

    expect(txns).toHaveLength(1);
    expect(txns[0].name).toBe('Deposit');
  });

  test('skips rows with missing date or amount', () => {
    const csv = [
      'Date,Description,Amount',
      ',No Date,100',
      '01/15/2025,No Amount,',
      '01/16/2025,Valid,50.00',
    ].join('\n');

    const txns = parseM1FinanceActivity(csv);

    expect(txns).toHaveLength(1);
    expect(txns[0].name).toBe('Valid');
  });

  test('strips non-numeric chars from amounts', () => {
    const csv = [
      'Date,Description,Amount',
      '01/15/2025,Deposit,"$1,000.00"',
    ].join('\n');

    const txns = parseM1FinanceActivity(csv);

    // After stripping, '1,000.00' → replace non-numeric → '1000.00'
    expect(txns[0].amount).toBe(1000);
  });

  test('returns empty array for empty content', () => {
    const txns = parseM1FinanceActivity('');
    expect(txns).toEqual([]);
  });
});

describe('parseM1Holdings', () => {
  test('parses holdings with Symbol column', () => {
    const csv = [
      'Symbol,Name,Shares,Price,Value',
      'VTI,Vanguard Total Stock,10.5,250.00,2625.00',
      'BND,Vanguard Total Bond,20,75.50,1510.00',
    ].join('\n');

    const holdings = parseM1Holdings(csv);

    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({
      symbol: 'VTI',
      name: 'Vanguard Total Stock',
      shares: 10.5,
      price: 250,
      value: 2625,
    });
  });

  test('uses Ticker column as fallback', () => {
    const csv = [
      'Ticker,Description,Quantity,Last Price,Market Value',
      'AAPL,Apple Inc,5,185.00,925.00',
    ].join('\n');

    const holdings = parseM1Holdings(csv);

    expect(holdings).toHaveLength(1);
    expect(holdings[0].symbol).toBe('AAPL');
    expect(holdings[0].name).toBe('Apple Inc');
  });

  test('skips rows without symbol', () => {
    const csv = [
      'Symbol,Name,Shares,Price,Value',
      ',No Symbol,10,100,1000',
      'VTI,Valid,5,250,1250',
    ].join('\n');

    const holdings = parseM1Holdings(csv);

    expect(holdings).toHaveLength(1);
    expect(holdings[0].symbol).toBe('VTI');
  });

  test('uses symbol as name fallback', () => {
    const csv = [
      'Symbol,Shares,Price,Value',
      'SPY,100,550.00,55000.00',
    ].join('\n');

    const holdings = parseM1Holdings(csv);

    expect(holdings).toHaveLength(1);
    expect(holdings[0].name).toBe('SPY');
  });

  test('returns empty array for empty content', () => {
    const holdings = parseM1Holdings('');
    expect(holdings).toEqual([]);
  });
});
