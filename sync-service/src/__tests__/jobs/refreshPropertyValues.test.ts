/**
 * Tests for refreshPropertyValues job.
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockFetchPropertyValue = jest.fn();
jest.mock('../../assets/propertyValuation', () => ({
  fetchPropertyValue: mockFetchPropertyValue,
}));

const mockEvaluateRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({
  evaluateAlertRules: mockEvaluateRules,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { refreshPropertyValues } from '../../jobs/refreshPropertyValues';

afterEach(() => jest.clearAllMocks());

describe('refreshPropertyValues', () => {
  test('updates property values and records history', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a1', user_id: 'u1', name: 'My House',
        address: '123 Main St', city: 'Denver', state: 'CO', zip: '80203',
        current_value: '400000',
      }],
    });
    mockFetchPropertyValue.mockResolvedValueOnce({
      value: 410000,
      source: 'homesage',
    });
    mockQuery.mockResolvedValue({ rows: [] }); // UPDATE + INSERT

    await refreshPropertyValues();

    expect(mockFetchPropertyValue).toHaveBeenCalledWith('123 Main St', 'Denver', 'CO', '80203');
    // UPDATE current_value
    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE manual_assets SET current_value = $1, updated_at = now() WHERE id = $2',
      [410000, 'a1']
    );
    // INSERT history
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO asset_value_history'),
      ['a1', 410000, 'homesage']
    );
  });

  test('triggers alert when value changes >5%', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a2', user_id: 'u1', name: 'House',
        address: '456 Oak', city: 'LA', state: 'CA', zip: '90001',
        current_value: '500000',
      }],
    });
    mockFetchPropertyValue.mockResolvedValueOnce({
      value: 535000, // 7% increase
      source: 'rentcast',
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await refreshPropertyValues();

    expect(mockEvaluateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'asset_value_change',
        userId: 'u1',
        amount: 535000,
        metadata: expect.objectContaining({
          oldValue: 500000,
          newValue: 535000,
        }),
      })
    );
  });

  test('does not alert when value changes <5%', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a3', user_id: 'u1', name: 'Condo',
        address: '789 Elm', city: 'SF', state: 'CA', zip: '94102',
        current_value: '600000',
      }],
    });
    mockFetchPropertyValue.mockResolvedValueOnce({
      value: 612000, // 2% increase
      source: 'homesage',
    });
    mockQuery.mockResolvedValue({ rows: [] });

    await refreshPropertyValues();

    expect(mockEvaluateRules).not.toHaveBeenCalled();
  });

  test('skips properties without address/city/state', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'a4', name: 'Land', address: null, city: null, state: null, current_value: '100000' }],
    });

    await refreshPropertyValues();

    expect(mockFetchPropertyValue).not.toHaveBeenCalled();
  });

  test('skips when valuation returns null', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'a5', user_id: 'u1', name: 'Rural',
        address: '999 Rural Rd', city: 'Nowhere', state: 'MT', zip: '59000',
        current_value: '200000',
      }],
    });
    mockFetchPropertyValue.mockResolvedValueOnce(null);

    await refreshPropertyValues();

    // Should not update DB
    expect(mockQuery).toHaveBeenCalledTimes(1); // only the initial SELECT
  });

  test('handles errors gracefully', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB error'));

    await expect(refreshPropertyValues()).resolves.toBeUndefined();
  });
});
