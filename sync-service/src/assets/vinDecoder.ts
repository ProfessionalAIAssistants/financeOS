import axios from 'axios';

export interface VINInfo {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyClass?: string;
  engineSize?: string;
  driveType?: string;
  fuelType?: string;
  doors?: number;
}

export async function decodeVIN(vin: string): Promise<VINInfo> {
  if (!vin || vin.length < 11) return {};
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`;
    const r = await axios.get(url, { timeout: 10000 });
    const results: Array<{ Variable: string; Value: string }> = r.data?.Results ?? [];

    const get = (variable: string) =>
      results.find(x => x.Variable === variable)?.Value || undefined;

    return {
      year:        parseInt(get('Model Year') ?? '0') || undefined,
      make:        get('Make'),
      model:       get('Model'),
      trim:        get('Trim'),
      bodyClass:   get('Body Class'),
      engineSize:  get('Displacement (L)'),
      driveType:   get('Drive Type'),
      fuelType:    get('Fuel Type - Primary'),
      doors:       parseInt(get('Doors') ?? '0') || undefined,
    };
  } catch {
    return {};
  }
}
