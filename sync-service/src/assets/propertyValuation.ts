import axios from 'axios';
import { config } from '../config';

export interface PropertyValue {
  value: number;
  source: string;
  confidence?: number;
  priceRangeLow?: number;
  priceRangeHigh?: number;
  lastUpdated: string;
}

async function tryHomesage(address: string, city: string, state: string, zip: string): Promise<PropertyValue | null> {
  if (!config.homesageApiKey) return null;
  try {
    const r = await axios.get('https://api.homesage.ai/v1/avm', {
      params: { address, city, state, zip },
      headers: { Authorization: `Bearer ${config.homesageApiKey}` },
      timeout: 10000,
    });
    const d = r.data;
    if (!d?.estimate) return null;
    return {
      value: d.estimate,
      source: 'homesage',
      confidence: d.confidence,
      priceRangeLow: d.range_low,
      priceRangeHigh: d.range_high,
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function tryRentCast(address: string, city: string, state: string, zip: string): Promise<PropertyValue | null> {
  if (!config.rentcastApiKey) return null;
  try {
    const r = await axios.get('https://api.rentcast.io/v1/avm/value', {
      params: { address: `${address}, ${city}, ${state} ${zip}` },
      headers: { 'X-Api-Key': config.rentcastApiKey },
      timeout: 10000,
    });
    const d = r.data;
    if (!d?.price) return null;
    return {
      value: d.price,
      source: 'rentcast',
      priceRangeLow: d.priceLow,
      priceRangeHigh: d.priceHigh,
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchPropertyValue(
  address: string,
  city: string,
  state: string,
  zip: string
): Promise<PropertyValue | null> {
  const homesage = await tryHomesage(address, city, state, zip);
  if (homesage) return homesage;

  const rentcast = await tryRentCast(address, city, state, zip);
  if (rentcast) return rentcast;

  return null;
}
