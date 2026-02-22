/**
 * Tests for evaluateAlertRules.
 *
 * Mocks:
 *  - db/client  – controls which alert rules are "enabled" in the DB
 *  - alerts/ntfy – spy to verify the correct alert payload is sent
 */

const mockQuery = jest.fn();
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockCreateAlert = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/ntfy', () => ({ createAlert: mockCreateAlert }));

import { evaluateAlertRules, AlertEvent } from '../../alerts/rules';

// Helper: make the DB return a set of rules
function withRules(rules: Array<{ rule_type: string; threshold?: number; severity?: string }>) {
  mockQuery.mockResolvedValue({ rows: rules });
}

afterEach(() => {
  mockQuery.mockReset();
  mockCreateAlert.mockClear();
});

// ── No rules enabled ──────────────────────────────────────────────────────────

describe('evaluateAlertRules – no matching rules', () => {
  test('does not send alert when rule list is empty', async () => {
    withRules([]);
    await evaluateAlertRules({ type: 'low_balance', balance: 50 });
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });
});

// ── low_balance ───────────────────────────────────────────────────────────────

describe('evaluateAlertRules – low_balance', () => {
  const lowBalRule = { rule_type: 'low_balance', threshold: 100, severity: 'high' };

  test('triggers alert when balance is below threshold', async () => {
    withRules([lowBalRule]);
    const event: AlertEvent = { type: 'low_balance', balance: 49.99, accountName: 'Savings' };
    await evaluateAlertRules(event);
    expect(mockCreateAlert).toHaveBeenCalledTimes(1);
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('Low Balance');
    expect(payload.message).toContain('$49.99');
    expect(payload.message).toContain('$100');
    expect(payload.message).toContain('Savings');
  });

  test('does not trigger when balance equals threshold', async () => {
    withRules([lowBalRule]);
    await evaluateAlertRules({ type: 'low_balance', balance: 100 });
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });

  test('does not trigger when balance is above threshold', async () => {
    withRules([lowBalRule]);
    await evaluateAlertRules({ type: 'low_balance', balance: 200 });
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });

  test('does not trigger when balance is undefined', async () => {
    withRules([lowBalRule]);
    await evaluateAlertRules({ type: 'low_balance' });
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });
});

// ── large_transaction ─────────────────────────────────────────────────────────

describe('evaluateAlertRules – large_transaction', () => {
  const largeTxRule = { rule_type: 'large_transaction', threshold: 500, severity: 'medium' };

  test('triggers alert when absolute amount exceeds threshold', async () => {
    withRules([largeTxRule]);
    await evaluateAlertRules({ type: 'large_transaction', amount: 750, description: 'RENT' });
    expect(mockCreateAlert).toHaveBeenCalledTimes(1);
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('Large Transaction');
    expect(payload.message).toContain('$750.00');
    expect(payload.message).toContain('RENT');
  });

  test('triggers for negative amounts (credits) using Math.abs', async () => {
    withRules([largeTxRule]);
    await evaluateAlertRules({ type: 'large_transaction', amount: -800 });
    expect(mockCreateAlert).toHaveBeenCalledTimes(1);
  });

  test('does not trigger when amount equals threshold', async () => {
    withRules([largeTxRule]);
    await evaluateAlertRules({ type: 'large_transaction', amount: 500 });
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });

  test('does not trigger when amount is below threshold', async () => {
    withRules([largeTxRule]);
    await evaluateAlertRules({ type: 'large_transaction', amount: 200 });
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });
});

// ── sync_failure ──────────────────────────────────────────────────────────────

describe('evaluateAlertRules – sync_failure', () => {
  const syncRule = { rule_type: 'sync_failure', severity: 'critical' };

  test('always triggers for sync_failure', async () => {
    withRules([syncRule]);
    await evaluateAlertRules({ type: 'sync_failure', institution: 'Chase', description: 'Timeout' });
    expect(mockCreateAlert).toHaveBeenCalledTimes(1);
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('Sync Failed');
    expect(payload.message).toContain('Chase');
    expect(payload.message).toContain('Timeout');
  });
});

// ── new_subscription ──────────────────────────────────────────────────────────

describe('evaluateAlertRules – new_subscription', () => {
  const subRule = { rule_type: 'new_subscription', severity: 'medium' };

  test('sends subscription alert with amount', async () => {
    withRules([subRule]);
    await evaluateAlertRules({ type: 'new_subscription', description: 'HBO Max', amount: 15.99 });
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('New Subscription');
    expect(payload.message).toContain('HBO Max');
    expect(payload.message).toContain('15.99');
  });

  test('handles missing amount gracefully', async () => {
    withRules([subRule]);
    await evaluateAlertRules({ type: 'new_subscription', description: 'Unknown Service' });
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.message).toContain('?');
  });
});

// ── anomaly ───────────────────────────────────────────────────────────────────

describe('evaluateAlertRules – anomaly', () => {
  const anomalyRule = { rule_type: 'anomaly', severity: 'high' };

  test('sends anomaly alert with description', async () => {
    withRules([anomalyRule]);
    await evaluateAlertRules({
      type: 'anomaly',
      description: 'Unusually large: AMAZON $500.00 (avg $20.00)',
    });
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('Unusual Transaction');
    expect(payload.message).toContain('AMAZON');
  });
});

// ── net_worth_milestone ───────────────────────────────────────────────────────

describe('evaluateAlertRules – net_worth_milestone', () => {
  const milestoneRule = { rule_type: 'net_worth_milestone', severity: 'low' };

  test('sends milestone alert', async () => {
    withRules([milestoneRule]);
    await evaluateAlertRules({
      type: 'net_worth_milestone',
      description: 'You have reached $100,000 net worth!',
    });
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('Milestone');
    expect(payload.message).toContain('$100,000');
  });
});

// ── asset_value_change ────────────────────────────────────────────────────────

describe('evaluateAlertRules – asset_value_change', () => {
  const assetRule = { rule_type: 'asset_value_change' };

  test('sends asset value update alert', async () => {
    withRules([assetRule]);
    await evaluateAlertRules({
      type: 'asset_value_change',
      description: '123 Main St increased by $5,000',
    });
    const payload = mockCreateAlert.mock.calls[0][0];
    expect(payload.title).toContain('Property Value');
  });
});

// ── Multiple rules ────────────────────────────────────────────────────────────

describe('evaluateAlertRules – multiple matching rules', () => {
  test('fires one alert per matching rule', async () => {
    // Two separate low_balance rules both enabled
    withRules([
      { rule_type: 'low_balance', threshold: 200 },
      { rule_type: 'low_balance', threshold: 100 },
    ]);
    await evaluateAlertRules({ type: 'low_balance', balance: 50 });
    expect(mockCreateAlert).toHaveBeenCalledTimes(2);
  });
});

// ── DB error tolerance ────────────────────────────────────────────────────────

describe('evaluateAlertRules – DB errors do not throw', () => {
  test('silently swallows DB query errors', async () => {
    mockQuery.mockRejectedValue(new Error('Connection timeout'));
    await expect(
      evaluateAlertRules({ type: 'sync_failure', description: 'Timeout' })
    ).resolves.toBeUndefined();
    expect(mockCreateAlert).not.toHaveBeenCalled();
  });
});
