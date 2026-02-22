/**
 * Tests for createAlert and sendPushNotification.
 *
 * Mocks:
 *  - axios  – prevents real HTTP calls to ntfy
 *  - db/client – prevents real DB calls
 */

const mockAxiosPost = jest.fn().mockResolvedValue({ status: 200 });
jest.mock('axios', () => ({ post: mockAxiosPost }));

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../db/client', () => ({ query: mockQuery }));

import { createAlert, sendPushNotification, AlertPayload } from '../../alerts/ntfy';

const basePayload: AlertPayload = {
  title: 'Test Alert',
  message: 'Something happened',
  priority: 'default',
  tags: ['white_check_mark'],
  ruleType: 'test_rule',
  severity: 'info',
};

afterEach(() => {
  mockAxiosPost.mockClear();
  mockQuery.mockClear();
});

// ── sendPushNotification ──────────────────────────────────────────────────────

describe('sendPushNotification', () => {
  test('calls axios.post once', async () => {
    await sendPushNotification(basePayload);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  test('sends message body as the POST body', async () => {
    await sendPushNotification(basePayload);
    expect(mockAxiosPost.mock.calls[0][1]).toBe('Something happened');
  });

  test('sets Title header', async () => {
    await sendPushNotification(basePayload);
    const headers = mockAxiosPost.mock.calls[0][2].headers;
    expect(headers['Title']).toBe('Test Alert');
  });

  test('sets Priority header', async () => {
    await sendPushNotification({ ...basePayload, priority: 'high' });
    const headers = mockAxiosPost.mock.calls[0][2].headers;
    expect(headers['Priority']).toBe('high');
  });

  test('defaults Priority to "default" when not set', async () => {
    const { priority, ...noP } = basePayload;
    await sendPushNotification(noP);
    const headers = mockAxiosPost.mock.calls[0][2].headers;
    expect(headers['Priority']).toBe('default');
  });

  test('joins tags array into comma-separated string', async () => {
    await sendPushNotification({ ...basePayload, tags: ['bell', 'moneybag'] });
    const headers = mockAxiosPost.mock.calls[0][2].headers;
    expect(headers['Tags']).toBe('bell,moneybag');
  });

  test('handles empty tags array', async () => {
    await sendPushNotification({ ...basePayload, tags: [] });
    const headers = mockAxiosPost.mock.calls[0][2].headers;
    expect(headers['Tags']).toBe('');
  });

  test('does not throw when axios rejects (network error)', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('Network unreachable'));
    await expect(sendPushNotification(basePayload)).resolves.toBeUndefined();
  });
});

// ── createAlert ───────────────────────────────────────────────────────────────

describe('createAlert', () => {
  test('inserts a row into alert_history', async () => {
    await createAlert(basePayload, false);
    const dbCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO alert_history')
    );
    expect(dbCall).toBeDefined();
  });

  test('saves the correct title and message', async () => {
    await createAlert(basePayload, false);
    const dbCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO alert_history')
    );
    const params = dbCall![1] as string[];
    expect(params).toContain('Test Alert');
    expect(params).toContain('Something happened');
  });

  test('saves the ruleType as first bind parameter', async () => {
    await createAlert(basePayload, false);
    const dbCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO alert_history')
    );
    expect(dbCall![1][0]).toBe('test_rule');
  });

  test('sends push notification when sendPush=true (default)', async () => {
    await createAlert(basePayload);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  test('does not send push notification when sendPush=false', async () => {
    await createAlert(basePayload, false);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('still sends push even if DB insert fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    await createAlert(basePayload, true);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  test('serialises metadata as JSON string in DB params', async () => {
    const payload = { ...basePayload, metadata: { amount: 250, merchant: 'ACME' } };
    await createAlert(payload, false);
    const dbCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO alert_history')
    );
    const metaParam = dbCall![1][4];
    expect(typeof metaParam).toBe('string');
    const parsed = JSON.parse(metaParam as string);
    expect(parsed.amount).toBe(250);
    expect(parsed.merchant).toBe('ACME');
  });

  test('passes null for metadata when none provided', async () => {
    const { metadata, ...noMeta } = basePayload;
    await createAlert(noMeta, false);
    const dbCall = mockQuery.mock.calls.find(
      c => typeof c[0] === 'string' && c[0].includes('INSERT INTO alert_history')
    );
    expect(dbCall![1][4]).toBeNull();
  });
});
