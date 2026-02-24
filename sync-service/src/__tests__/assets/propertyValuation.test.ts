/**
 * Tests for propertyValuation module.
 */

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({
  default: { get: mockAxiosGet },
  get: mockAxiosGet,
}));

jest.mock('../../config', () => ({
  config: {
    homesageApiKey: 'test-homesage-key',
    rentcastApiKey: 'test-rentcast-key',
  },
}));

import { fetchPropertyValue } from '../../assets/propertyValuation';

afterEach(() => jest.clearAllMocks());

describe('fetchPropertyValue', () => {
  test('returns Homesage result when available', async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        estimate: 450000,
        confidence: 0.85,
        range_low: 420000,
        range_high: 480000,
      },
    });

    const result = await fetchPropertyValue('123 Main St', 'Denver', 'CO', '80203');

    expect(result).toMatchObject({
      value: 450000,
      source: 'homesage',
      confidence: 0.85,
      priceRangeLow: 420000,
      priceRangeHigh: 480000,
    });
    expect(result?.lastUpdated).toBeDefined();
    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://api.homesage.ai/v1/avm',
      expect.objectContaining({
        params: { address: '123 Main St', city: 'Denver', state: 'CO', zip: '80203' },
        headers: { Authorization: 'Bearer test-homesage-key' },
      })
    );
  });

  test('falls back to RentCast when Homesage fails', async () => {
    // Homesage fails
    mockAxiosGet.mockRejectedValueOnce(new Error('API error'));
    // RentCast succeeds
    mockAxiosGet.mockResolvedValueOnce({
      data: { price: 440000, priceLow: 410000, priceHigh: 470000 },
    });

    const result = await fetchPropertyValue('456 Oak', 'LA', 'CA', '90001');

    expect(result).toMatchObject({
      value: 440000,
      source: 'rentcast',
      priceRangeLow: 410000,
      priceRangeHigh: 470000,
    });
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  });

  test('returns null when both APIs fail', async () => {
    mockAxiosGet.mockRejectedValue(new Error('All down'));

    const result = await fetchPropertyValue('789 Elm', 'NYC', 'NY', '10001');

    expect(result).toBeNull();
  });

  test('returns null when Homesage returns no estimate', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: { estimate: null } });
    mockAxiosGet.mockRejectedValueOnce(new Error('fail'));

    const result = await fetchPropertyValue('addr', 'city', 'ST', '00000');

    expect(result).toBeNull();
  });

  test('returns null when RentCast returns no price', async () => {
    mockAxiosGet.mockRejectedValueOnce(new Error('homesage fail'));
    mockAxiosGet.mockResolvedValueOnce({ data: { price: null } });

    const result = await fetchPropertyValue('addr', 'city', 'ST', '00000');

    expect(result).toBeNull();
  });
});
