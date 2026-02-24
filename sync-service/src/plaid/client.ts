import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { config } from '../config';

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[config.plaidEnv as keyof typeof PlaidEnvironments] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': config.plaidClientId,
      'PLAID-SECRET': config.plaidSecret,
    },
  },
});

export const plaidClient = new PlaidApi(plaidConfig);

/**
 * Default products to request for Link.
 * - transactions: transaction history + real-time sync
 * - auth:         account/routing numbers (ACH)
 * - identity:     account holder info
 */
export const DEFAULT_PRODUCTS: Products[] = [
  Products.Transactions,
];

/** Always US for now */
export const DEFAULT_COUNTRY_CODES: CountryCode[] = [CountryCode.Us];

/** Simple encryption helpers using the server encryption key */
import CryptoJS from 'crypto-js';

export function encryptToken(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, config.encryptionKey).toString();
}

export function decryptToken(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, config.encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}
