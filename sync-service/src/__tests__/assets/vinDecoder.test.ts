/**
 * Tests for VIN decoder.
 */

const mockAxiosGet = jest.fn();
jest.mock('axios', () => ({
  default: { get: mockAxiosGet },
  get: mockAxiosGet,
}));

import { decodeVIN } from '../../assets/vinDecoder';

afterEach(() => jest.clearAllMocks());

describe('decodeVIN', () => {
  test('decodes a valid VIN from NHTSA API', async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        Results: [
          { Variable: 'Model Year', Value: '2022' },
          { Variable: 'Make', Value: 'Toyota' },
          { Variable: 'Model', Value: 'Camry' },
          { Variable: 'Trim', Value: 'SE' },
          { Variable: 'Body Class', Value: 'Sedan' },
          { Variable: 'Displacement (L)', Value: '2.5' },
          { Variable: 'Drive Type', Value: 'FWD' },
          { Variable: 'Fuel Type - Primary', Value: 'Gasoline' },
          { Variable: 'Doors', Value: '4' },
        ],
      },
    });

    const result = await decodeVIN('1HGCG5655WA123456');

    expect(result).toEqual({
      year: 2022,
      make: 'Toyota',
      model: 'Camry',
      trim: 'SE',
      bodyClass: 'Sedan',
      engineSize: '2.5',
      driveType: 'FWD',
      fuelType: 'Gasoline',
      doors: 4,
    });
    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/1HGCG5655WA123456?format=json',
      { timeout: 10000 }
    );
  });

  test('returns empty object for short VIN', async () => {
    const result = await decodeVIN('SHORT');

    expect(result).toEqual({});
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  test('returns empty object for empty VIN', async () => {
    const result = await decodeVIN('');

    expect(result).toEqual({});
  });

  test('returns empty object on API error', async () => {
    mockAxiosGet.mockRejectedValueOnce(new Error('Network error'));

    const result = await decodeVIN('1HGCG5655WA123456');

    expect(result).toEqual({});
  });

  test('handles missing fields gracefully', async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        Results: [
          { Variable: 'Make', Value: 'Honda' },
          { Variable: 'Model', Value: 'Civic' },
        ],
      },
    });

    const result = await decodeVIN('1HGCG5655WA999999');

    expect(result).toEqual({
      year: undefined,
      make: 'Honda',
      model: 'Civic',
      trim: undefined,
      bodyClass: undefined,
      engineSize: undefined,
      driveType: undefined,
      fuelType: undefined,
      doors: undefined,
    });
  });
});
