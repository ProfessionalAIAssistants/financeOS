/**
 * Tests for Plaid client helpers — encryptToken, decryptToken.
 */

jest.mock('../../config', () => ({
  config: {
    plaidClientId: 'test-client-id',
    plaidSecret: 'test-secret',
    plaidEnv: 'sandbox',
    encryptionKey: 'test-encryption-key-32ch',
  },
}));

// Mock plaid SDK to avoid import errors
jest.mock('plaid', () => ({
  Configuration: jest.fn().mockImplementation(() => ({})),
  PlaidApi: jest.fn().mockImplementation(() => ({})),
  PlaidEnvironments: { sandbox: 'https://sandbox.plaid.com' },
  Products: { Transactions: 'transactions' },
  CountryCode: { Us: 'US' },
}));

import { encryptToken, decryptToken } from '../../plaid/client';

describe('Plaid client – token encryption helpers', () => {
  test('encrypts and decrypts a token roundtrip', () => {
    const original = 'access-sandbox-abc123-def456';
    const encrypted = encryptToken(original);

    // Encrypted should be different from original
    expect(encrypted).not.toBe(original);
    expect(encrypted.length).toBeGreaterThan(0);

    // Decryption should recover original
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  test('different plaintexts produce different ciphertexts', () => {
    const enc1 = encryptToken('token-aaa');
    const enc2 = encryptToken('token-bbb');
    expect(enc1).not.toBe(enc2);
  });

  test('handles empty string', () => {
    const enc = encryptToken('');
    const dec = decryptToken(enc);
    expect(dec).toBe('');
  });

  test('handles long tokens', () => {
    const longToken = 'a'.repeat(500);
    const enc = encryptToken(longToken);
    const dec = decryptToken(enc);
    expect(dec).toBe(longToken);
  });
});
