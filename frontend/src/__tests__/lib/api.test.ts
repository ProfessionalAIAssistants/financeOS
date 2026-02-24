import { describe, test, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mock fns are available inside the hoisted vi.mock factory
const { mockGet, mockPost, mockPut, mockDelete, mockPatch, mockInterceptors } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockPatch: vi.fn(),
  mockInterceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockGet,
      post: mockPost,
      put: mockPut,
      delete: mockDelete,
      patch: mockPatch,
      interceptors: mockInterceptors,
      defaults: { headers: { common: {} } },
    }),
    post: vi.fn(),
  },
}));

// Import after mock
import api, { transactionsApi, alertsApi, insightsApi, forecastApi, networthApi, syncApi, assetsApi, subsApi, insuranceApi, tagsApi, budgetsApi, uploadApi, authApi, billingApi, plaidApi } from '../../lib/api';

describe('API module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transactionsApi', () => {
    test('list calls GET /transactions with params', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [{ id: '1' }] } });
      const result = await transactionsApi.list(1, 50, 'withdrawal');
      expect(mockGet).toHaveBeenCalledWith('/transactions', {
        params: expect.objectContaining({ page: 1, limit: 50, type: 'withdrawal' }),
      });
      expect(result).toEqual([{ id: '1' }]);
    });

    test('create calls POST /transactions', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { id: 'new' } } });
      const result = await transactionsApi.create({ description: 'Test' });
      expect(mockPost).toHaveBeenCalledWith('/transactions', { description: 'Test' });
      expect(result).toEqual({ id: 'new' });
    });

    test('update calls PUT /transactions/:id', async () => {
      mockPut.mockResolvedValueOnce({ data: { data: { id: '1', description: 'Updated' } } });
      const result = await transactionsApi.update('1', { description: 'Updated' });
      expect(mockPut).toHaveBeenCalledWith('/transactions/1', { description: 'Updated' });
    });

    test('delete calls DELETE /transactions/:id', async () => {
      mockDelete.mockResolvedValueOnce({ data: {} });
      await transactionsApi.delete('1');
      expect(mockDelete).toHaveBeenCalledWith('/transactions/1');
    });

    test('accounts calls GET /transactions/meta/accounts', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [{ id: 'a1' }] } });
      const result = await transactionsApi.accounts();
      expect(mockGet).toHaveBeenCalledWith('/transactions/meta/accounts');
    });

    test('categories calls GET /transactions/meta/categories', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [{ id: 'c1' }] } });
      await transactionsApi.categories();
      expect(mockGet).toHaveBeenCalledWith('/transactions/meta/categories');
    });
  });

  describe('alertsApi', () => {
    test('list calls GET /alerts', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await alertsApi.list(20);
      expect(mockGet).toHaveBeenCalledWith('/alerts?limit=20');
    });

    test('markRead calls PUT /alerts/:id/read', async () => {
      mockPut.mockResolvedValueOnce({ data: {} });
      await alertsApi.markRead('a1');
      expect(mockPut).toHaveBeenCalledWith('/alerts/a1/read');
    });

    test('markAllRead calls PUT /alerts/read-all', async () => {
      mockPut.mockResolvedValueOnce({ data: {} });
      await alertsApi.markAllRead();
      expect(mockPut).toHaveBeenCalledWith('/alerts/read-all');
    });

    test('rules calls GET /alerts/rules', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await alertsApi.rules();
      expect(mockGet).toHaveBeenCalledWith('/alerts/rules');
    });
  });

  describe('insightsApi', () => {
    test('list calls GET /insights with limit', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await insightsApi.list(5);
      expect(mockGet).toHaveBeenCalledWith('/insights?limit=5');
    });

    test('generate calls POST /insights/generate', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await insightsApi.generate(2025, 1);
      expect(mockPost).toHaveBeenCalledWith('/insights/generate', { year: 2025, month: 1 });
    });

    test('savingsRate calls GET', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { rate: 30 } } });
      const result = await insightsApi.savingsRate();
      expect(mockGet).toHaveBeenCalledWith('/insights/savings-rate');
    });
  });

  describe('forecastApi', () => {
    test('latest calls GET /forecasting/latest', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: {} } });
      await forecastApi.latest(24);
      expect(mockGet).toHaveBeenCalledWith('/forecasting/latest?horizon=24');
    });

    test('whatif calls POST /forecasting/whatif', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: {} } });
      await forecastApi.whatif({ income: 1000 });
      expect(mockPost).toHaveBeenCalledWith('/forecasting/whatif', { income: 1000 });
    });
  });

  describe('networthApi', () => {
    test('current calls GET /networth/current', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: { net_worth: 100000 } } });
      const result = await networthApi.current();
      expect(mockGet).toHaveBeenCalledWith('/networth/current');
    });

    test('history calls GET with days param', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await networthApi.history(90);
      expect(mockGet).toHaveBeenCalledWith('/networth/history?days=90');
    });

    test('snapshot calls POST /networth/snapshot', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await networthApi.snapshot();
      expect(mockPost).toHaveBeenCalledWith('/networth/snapshot');
    });
  });

  describe('assetsApi', () => {
    test('list calls GET /assets', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await assetsApi.list();
      expect(mockGet).toHaveBeenCalledWith('/assets');
    });

    test('create calls POST /assets', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { id: 'a1' } } });
      await assetsApi.create({ name: 'House' });
      expect(mockPost).toHaveBeenCalledWith('/assets', { name: 'House' });
    });

    test('addPayment calls POST /assets/:id/note-payment', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await assetsApi.addPayment('a1', { amount: 500 });
      expect(mockPost).toHaveBeenCalledWith('/assets/a1/note-payment', { amount: 500 });
    });
  });

  describe('subsApi', () => {
    test('list calls GET /subscriptions with status', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await subsApi.list('all');
      expect(mockGet).toHaveBeenCalledWith('/subscriptions?status=all');
    });

    test('detect calls POST /subscriptions/detect', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await subsApi.detect();
      expect(mockPost).toHaveBeenCalledWith('/subscriptions/detect');
    });
  });

  describe('insuranceApi', () => {
    test('list calls GET /insurance', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await insuranceApi.list();
      expect(mockGet).toHaveBeenCalledWith('/insurance');
    });

    test('aiReview calls POST /insurance/:id/ai-review', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { review: 'ok' } } });
      const result = await insuranceApi.aiReview('i1');
      expect(mockPost).toHaveBeenCalledWith('/insurance/i1/ai-review');
    });
  });

  describe('tagsApi', () => {
    test('list calls GET /tags', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await tagsApi.list();
      expect(mockGet).toHaveBeenCalledWith('/tags');
    });

    test('create calls POST /tags', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: { id: 't1' } } });
      await tagsApi.create('test-tag', 'desc');
      expect(mockPost).toHaveBeenCalledWith('/tags', { tag: 'test-tag', description: 'desc' });
    });

    test('delete encodes tag name', async () => {
      mockDelete.mockResolvedValueOnce({ data: {} });
      await tagsApi.delete('my tag');
      expect(mockDelete).toHaveBeenCalledWith('/tags/my%20tag');
    });
  });

  describe('budgetsApi', () => {
    test('list calls GET /budgets', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await budgetsApi.list();
      expect(mockGet).toHaveBeenCalledWith('/budgets');
    });

    test('createLimit calls POST /budgets/:id/limits', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: {} } });
      await budgetsApi.createLimit('b1', { start: '2025-01-01', end: '2025-01-31', amount: '500' });
      expect(mockPost).toHaveBeenCalledWith('/budgets/b1/limits', expect.any(Object));
    });
  });

  describe('authApi', () => {
    test('me calls GET /auth/me', async () => {
      mockGet.mockResolvedValueOnce({ data: { id: 'u1' } });
      await authApi.me();
      expect(mockGet).toHaveBeenCalledWith('/auth/me');
    });

    test('logout calls POST /auth/logout', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await authApi.logout('token123');
      expect(mockPost).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'token123' });
    });
  });

  describe('syncApi', () => {
    test('status calls GET /sync/status', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: {} } });
      await syncApi.status();
      expect(mockGet).toHaveBeenCalledWith('/sync/status');
    });

    test('force calls POST /sync/force', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });
      await syncApi.force('chase');
      expect(mockPost).toHaveBeenCalledWith('/sync/force', { institution: 'chase' });
    });
  });

  describe('plaidApi', () => {
    test('createLinkToken calls POST /plaid/link-token', async () => {
      mockPost.mockResolvedValueOnce({ data: { linkToken: 'tok', expiration: '2025-01-01' } });
      const result = await plaidApi.createLinkToken();
      expect(mockPost).toHaveBeenCalledWith('/plaid/link-token', { itemId: undefined });
    });

    test('items calls GET /plaid/items', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });
      await plaidApi.items();
      expect(mockGet).toHaveBeenCalledWith('/plaid/items');
    });
  });
});
