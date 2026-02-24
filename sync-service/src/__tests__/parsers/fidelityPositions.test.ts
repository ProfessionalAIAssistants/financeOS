/**
 * Tests for Fidelity position/transaction parser.
 */

import { parseFidelityPositions, parseFidelityTransactions } from '../../parsers/fidelityPositions';

describe('parseFidelityPositions', () => {
  test('parses positions from CSV with extra header rows', () => {
    const csv = [
      'Fidelity Account Report',
      'Date: 01/15/2025',
      '',
      'Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Total Gain/Loss Dollar',
      'AAPL,Apple Inc,10,185.50,1855.00,1500.00,355.00',
      'MSFT,Microsoft Corp,5,$420.00,2100.00,1800.00,300.00',
    ].join('\n');

    const positions = parseFidelityPositions(csv);

    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({
      symbol: 'AAPL',
      description: 'Apple Inc',
      quantity: 10,
      lastPrice: 185.5,
      currentValue: 1855,
      costBasis: 1500,
      gainLoss: 355,
    });
    expect(positions[1]).toMatchObject({
      symbol: 'MSFT',
      description: 'Microsoft Corp',
      quantity: 5,
      currentValue: 2100,
    });
  });

  test('skips rows with invalid symbols', () => {
    const csv = [
      'Symbol,Description,Quantity,Last Price,Current Value',
      '--,Separator,0,0,0',
      ',EmptySymbol,0,0,0',
      'VTI,Vanguard Total,100,250.00,25000.00',
    ].join('\n');

    const positions = parseFidelityPositions(csv);

    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe('VTI');
  });

  test('returns empty array when no header row found', () => {
    const csv = 'No,Valid,Headers\nsome,random,data';

    const positions = parseFidelityPositions(csv);

    expect(positions).toEqual([]);
  });

  test('handles missing cost basis fields', () => {
    const csv = [
      'Symbol,Description,Quantity,Last Price,Current Value',
      'TSLA,Tesla Inc,2,250.00,500.00',
    ].join('\n');

    const positions = parseFidelityPositions(csv);

    expect(positions).toHaveLength(1);
    // When columns are missing, parseFloat returns NaN → costBasis/gainLoss become undefined
    // But if columns exist with '0' they'll be 0
    expect(positions[0].costBasis).toBeDefined(); // defaults to 0 from parseFloat('0')
  });
});

describe('parseFidelityTransactions', () => {
  test('parses transaction rows', () => {
    const csv = [
      'Date,Description,Amount',
      '01/15/2025,Dividend Received,125.50',
      '01/10/2025,Buy AAPL,-1855.00',
    ].join('\n');

    const txns = parseFidelityTransactions(csv);

    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      date: '2025-01-15',
      name: 'Dividend Received',
      amount: 125.5,
    });
    expect(txns[1]).toMatchObject({
      name: 'Buy AAPL',
      amount: -1855,
    });
  });

  test('skips rows without date or amount', () => {
    const csv = [
      'Date,Description,Amount',
      ',Missing Date,100',
      '01/15/2025,Missing Amount,',
      '01/16/2025,Valid,50.00',
    ].join('\n');

    const txns = parseFidelityTransactions(csv);

    expect(txns).toHaveLength(1);
    expect(txns[0].name).toBe('Valid');
  });

  test('handles Settlement Date column', () => {
    const csv = [
      'Settlement Date,Action,Amount',
      '01/20/2025,Sell MSFT,2100.00',
    ].join('\n');

    const txns = parseFidelityTransactions(csv);

    expect(txns).toHaveLength(1);
    expect(txns[0].date).toBe('2025-01-20');
  });

  test('strips currency characters from amounts', () => {
    const csv = [
      'Date,Description,Amount',
      '01/15/2025,Deposit,$1000.00',
    ].join('\n');

    const txns = parseFidelityTransactions(csv);

    expect(txns[0].amount).toBe(1000);
  });

  test('returns empty for empty content', () => {
    const txns = parseFidelityTransactions('');
    expect(txns).toEqual([]);
  });
});
