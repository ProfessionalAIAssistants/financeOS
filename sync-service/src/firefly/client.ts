import axios from 'axios';
import { config } from '../config';

const ff = axios.create({
  baseURL: `${config.fireflyUrl}/api/v1`,
  headers: { Authorization: `Bearer ${config.fireflyToken}`, 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── Accounts ──────────────────────────────────────────────────────────────────
export async function getAccounts(type?: string) {
  const r = await ff.get('/accounts', { params: { type: type ?? 'all', limit: 500 } });
  return r.data.data ?? [];
}

export async function createAccount(data: Record<string, unknown>) {
  const r = await ff.post('/accounts', data);
  return r.data.data;
}

export async function updateAccountBalance(id: string, balance: number, date: string) {
  return ff.put(`/accounts/${id}`, { current_balance: balance, current_balance_date: date });
}

export async function getAccountBalance(id: string): Promise<number> {
  const r = await ff.get(`/accounts/${id}`);
  return parseFloat(r.data.data?.attributes?.current_balance ?? '0');
}

// ── Transactions ──────────────────────────────────────────────────────────────
export async function getTransactions(
  page = 1,
  limit = 50,
  type?: string,
  accountId?: string,
  query?: string,
  start?: string,
  end?: string,
) {
  const params: Record<string, unknown> = { page, limit };
  if (type)      params.type       = type;
  if (accountId) params.account_id = accountId;
  if (query)     params.query      = query;
  if (start)     params.start      = start;
  if (end)       params.end        = end;
  const r = await ff.get('/transactions', { params });
  return r.data.data ?? [];
}

export async function getTransaction(id: string) {
  const r = await ff.get(`/transactions/${id}`);
  return r.data.data;
}

export async function createTransaction(data: Record<string, unknown>) {
  const r = await ff.post('/transactions', { transactions: [data] });
  return r.data.data;
}

export async function updateTransaction(id: string, data: Record<string, unknown>) {
  const r = await ff.put(`/transactions/${id}`, { transactions: [data] });
  return r.data.data;
}

export async function deleteTransaction(id: string) {
  await ff.delete(`/transactions/${id}`);
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function getCategories() {
  const r = await ff.get('/categories', { params: { limit: 200 } });
  return r.data.data ?? [];
}

export async function createCategory(name: string) {
  const r = await ff.post('/categories', { name });
  return r.data.data;
}

export async function updateCategory(id: string, name: string) {
  const r = await ff.put(`/categories/${id}`, { name });
  return r.data.data;
}

export async function deleteCategory(id: string) {
  await ff.delete(`/categories/${id}`);
}

// ── Tags ──────────────────────────────────────────────────────────────────────
export async function getTags(page = 1, limit = 200) {
  const r = await ff.get('/tags', { params: { page, limit } });
  return r.data.data ?? [];
}

export async function createTag(data: { tag: string; description?: string; date?: string }) {
  const r = await ff.post('/tags', data);
  return r.data.data;
}

export async function updateTag(tagOrId: string, data: { tag?: string; description?: string }) {
  const r = await ff.put(`/tags/${encodeURIComponent(tagOrId)}`, data);
  return r.data.data;
}

export async function deleteTag(tagOrId: string) {
  await ff.delete(`/tags/${encodeURIComponent(tagOrId)}`);
}

export async function getTagTransactions(tagOrId: string, page = 1, limit = 50) {
  const r = await ff.get(`/tags/${encodeURIComponent(tagOrId)}/transactions`, { params: { page, limit } });
  return r.data.data ?? [];
}

// ── Budgets ───────────────────────────────────────────────────────────────────
export async function getBudgets() {
  const r = await ff.get('/budgets', { params: { limit: 200 } });
  return r.data.data ?? [];
}

export async function getBudget(id: string) {
  const r = await ff.get(`/budgets/${id}`);
  return r.data.data;
}

export async function createBudget(data: { name: string; active?: boolean; auto_budget_type?: string; auto_budget_currency_id?: string; auto_budget_amount?: string; auto_budget_period?: string }) {
  const r = await ff.post('/budgets', data);
  return r.data.data;
}

export async function updateBudget(id: string, data: Record<string, unknown>) {
  const r = await ff.put(`/budgets/${id}`, data);
  return r.data.data;
}

export async function deleteBudget(id: string) {
  await ff.delete(`/budgets/${id}`);
}

export async function getBudgetLimits(budgetId: string, start?: string, end?: string) {
  const params: Record<string, unknown> = {};
  if (start) params.start = start;
  if (end) params.end = end;
  const r = await ff.get(`/budgets/${budgetId}/limits`, { params });
  return r.data.data ?? [];
}

export async function createBudgetLimit(budgetId: string, data: { start: string; end: string; amount: string; currency_id?: string }) {
  const r = await ff.post(`/budgets/${budgetId}/limits`, data);
  return r.data.data;
}

export async function updateBudgetLimit(budgetId: string, limitId: string, data: Record<string, unknown>) {
  const r = await ff.put(`/budgets/${budgetId}/limits/${limitId}`, data);
  return r.data.data;
}

export async function deleteBudgetLimit(budgetId: string, limitId: string) {
  await ff.delete(`/budgets/${budgetId}/limits/${limitId}`);
}

export async function getBudgetTransactions(budgetId: string, start?: string, end?: string, page = 1, limit = 50) {
  const params: Record<string, unknown> = { page, limit };
  if (start) params.start = start;
  if (end) params.end = end;
  const r = await ff.get(`/budgets/${budgetId}/transactions`, { params });
  return r.data.data ?? [];
}

// ── Health ────────────────────────────────────────────────────────────────────
export async function isHealthy(): Promise<boolean> {
  try {
    await ff.get('/about');
    return true;
  } catch (err: unknown) {
    // 401 means Firefly is running but token not set yet — still "healthy"
    const status = (err as { response?: { status?: number } })?.response?.status;
    return status === 401;
  }
}
