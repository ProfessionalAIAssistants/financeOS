import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  r => r,
  err => {
    console.error('[API]', err.config?.url, err.response?.status, err.message);
    return Promise.reject(err);
  }
);

export default api;

// ── Net Worth ────────────────────────────────────────────────────────────────
export const networthApi = {
  current: ()        => api.get('/networth/current').then(r => r.data.data),
  history: (days=365)=> api.get(`/networth/history?days=${days}`).then(r => r.data.data),
  breakdown: ()      => api.get('/networth/breakdown').then(r => r.data.data),
  snapshot: ()       => api.post('/networth/snapshot').then(r => r.data),
};

// ── Sync ─────────────────────────────────────────────────────────────────────
export const syncApi = {
  status: ()        => api.get('/sync/status').then(r => r.data.data),
  log: (limit=50)   => api.get(`/sync/log?limit=${limit}`).then(r => r.data.data),
  force: (inst?:string) => api.post('/sync/force', { institution: inst }).then(r => r.data),
  snapshot: ()      => api.post('/sync/snapshot').then(r => r.data),
};

// ── Assets ───────────────────────────────────────────────────────────────────
export const assetsApi = {
  list: ()                      => api.get('/assets').then(r => r.data.data),
  get: (id:string)              => api.get(`/assets/${id}`).then(r => r.data.data),
  history: (id:string)          => api.get(`/assets/${id}/history`).then(r => r.data.data),
  amortization: (id:string)     => api.get(`/assets/${id}/amortization`).then(r => r.data.data),
  payments: (id:string)         => api.get(`/assets/${id}/payments`).then(r => r.data.data),
  create: (data:unknown)        => api.post('/assets', data).then(r => r.data.data),
  update: (id:string, data:unknown) => api.put(`/assets/${id}`, data).then(r => r.data),
  delete: (id:string)           => api.delete(`/assets/${id}`).then(r => r.data),
  addPayment: (id:string, d:unknown) => api.post(`/assets/${id}/note-payment`, d).then(r => r.data),
};

// ── Insights ─────────────────────────────────────────────────────────────────
export const insightsApi = {
  list: (limit=12)    => api.get(`/insights?limit=${limit}`).then(r => r.data.data),
  latest: ()          => api.get('/insights/latest').then(r => r.data.data),
  spending: (months=3)=> api.get(`/insights/spending?months=${months}`).then(r => r.data.data),
  categories: (start?: string, end?: string) => {
    const params: Record<string, string> = {};
    if (start) params.start = start;
    if (end)   params.end   = end;
    return api.get('/insights/categories', { params }).then(r => r.data.data);
  },
  generate: (year?:number, month?:number) =>
    api.post('/insights/generate', { year, month }).then(r => r.data),
  savingsRate: ()  => api.get('/insights/savings-rate').then(r => r.data.data),
  emergencyFund: () => api.get('/insights/emergency-fund').then(r => r.data.data),
};

// ── Subscriptions ────────────────────────────────────────────────────────────
export const subsApi = {
  list: (status='active') => api.get(`/subscriptions?status=${status}`).then(r => r.data.data),
  summary: ()             => api.get('/subscriptions/summary').then(r => r.data.data),
  update: (id:string, d:unknown) => api.put(`/subscriptions/${id}`, d).then(r => r.data),
  delete: (id:string)     => api.delete(`/subscriptions/${id}`).then(r => r.data),
  detect: ()              => api.post('/subscriptions/detect').then(r => r.data),
};

// ── Forecasting ──────────────────────────────────────────────────────────────
export const forecastApi = {
  latest: (horizon=12)  => api.get(`/forecasting/latest?horizon=${horizon}`).then(r => r.data.data),
  history: ()           => api.get('/forecasting/history').then(r => r.data.data),
  generate: (horizon=12, withdrawalRate?: number, inflationRate?: number) =>
    api.post('/forecasting/generate', { horizon, withdrawalRate, inflationRate }).then(r => r.data),
  whatif: (params:unknown) => api.post('/forecasting/whatif', params).then(r => r.data.data),
};

// ── Alerts ───────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: (limit=50)          => api.get(`/alerts?limit=${limit}`).then(r => r.data.data),
  unreadCount: ()           => api.get('/alerts/unread-count').then(r => r.data.count),
  markRead: (id:string)     => api.put(`/alerts/${id}/read`).then(r => r.data),
  markAllRead: ()           => api.put('/alerts/read-all').then(r => r.data),
  rules: ()                 => api.get('/alerts/rules').then(r => r.data.data),
  createRule: (d:unknown)   => api.post('/alerts/rules', d).then(r => r.data.data),
  updateRule: (id:string, d:unknown) => api.put(`/alerts/rules/${id}`, d).then(r => r.data),
  deleteRule: (id:string)   => api.delete(`/alerts/rules/${id}`).then(r => r.data),
  test: ()                  => api.post('/alerts/test').then(r => r.data),
};

// ── Insurance ────────────────────────────────────────────────────────────────
export const insuranceApi = {
  list: ()                   => api.get('/insurance').then(r => r.data.data),
  get: (id:string)           => api.get(`/insurance/${id}`).then(r => r.data.data),
  create: (d:unknown)        => api.post('/insurance', d).then(r => r.data.data),
  update: (id:string, d:unknown) => api.put(`/insurance/${id}`, d).then(r => r.data),
  delete: (id:string)        => api.delete(`/insurance/${id}`).then(r => r.data),
  aiReview: (id:string)      => api.post(`/insurance/${id}/ai-review`).then(r => r.data.data),
  annualCost: ()             => api.get('/insurance/summary/annual-cost').then(r => r.data.data),
};

// ── Upload ───────────────────────────────────────────────────────────────────
export const uploadApi = {
  upload: (file: File, institution: string, fileType='auto') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('institution', institution);
    fd.append('fileType', fileType);
    return api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  log: () => api.get('/upload/log').then(r => r.data.data),
};

// ── Transactions (full CRUD) ──────────────────────────────────────────────────
export const transactionsApi = {
  list: (page=1, limit=50, type?: string, accountId?: string, query?: string, start?: string, end?: string) => {
    const params: Record<string, unknown> = { page, limit };
    if (type)      params.type       = type;
    if (accountId) params.account_id = accountId;
    if (query)     params.query      = query;
    if (start)     params.start      = start;
    if (end)       params.end        = end;
    return api.get('/transactions', { params }).then(r => r.data.data ?? []);
  },
  get: (id: string)                  => api.get(`/transactions/${id}`).then(r => r.data.data),
  create: (d: unknown)               => api.post('/transactions', d).then(r => r.data.data),
  update: (id: string, d: unknown)   => api.put(`/transactions/${id}`, d).then(r => r.data.data),
  delete: (id: string)               => api.delete(`/transactions/${id}`).then(r => r.data),
  accounts: ()                       => api.get('/transactions/meta/accounts').then(r => r.data.data ?? []),
  categories: ()                     => api.get('/transactions/meta/categories').then(r => r.data.data ?? []),
  createCategory: (name: string)     => api.post('/transactions/meta/categories', { name }).then(r => r.data.data),
};

// ── Tags ──────────────────────────────────────────────────────────────────────
export const tagsApi = {
  list: ()                              => api.get('/tags').then(r => r.data.data ?? []),
  create: (tag: string, description?: string) => api.post('/tags', { tag, description }).then(r => r.data.data),
  update: (tag: string, d: unknown)     => api.put(`/tags/${encodeURIComponent(tag)}`, d).then(r => r.data.data),
  delete: (tag: string)                 => api.delete(`/tags/${encodeURIComponent(tag)}`).then(r => r.data),
  transactions: (tag: string, page=1)   => api.get(`/tags/${encodeURIComponent(tag)}/transactions`, { params: { page } }).then(r => r.data.data ?? []),
};

// ── Budgets ───────────────────────────────────────────────────────────────────
export const budgetsApi = {
  list: ()                              => api.get('/budgets').then(r => r.data.data ?? []),
  get: (id: string)                     => api.get(`/budgets/${id}`).then(r => r.data.data),
  create: (d: unknown)                  => api.post('/budgets', d).then(r => r.data.data),
  update: (id: string, d: unknown)      => api.put(`/budgets/${id}`, d).then(r => r.data.data),
  delete: (id: string)                  => api.delete(`/budgets/${id}`).then(r => r.data),
  limits: (id: string, start?: string, end?: string) => {
    const params: Record<string, unknown> = {};
    if (start) params.start = start;
    if (end) params.end = end;
    return api.get(`/budgets/${id}/limits`, { params }).then(r => r.data.data ?? []);
  },
  createLimit: (id: string, d: unknown) => api.post(`/budgets/${id}/limits`, d).then(r => r.data.data),
  updateLimit: (id: string, limitId: string, d: unknown) => api.put(`/budgets/${id}/limits/${limitId}`, d).then(r => r.data.data),
  deleteLimit: (id: string, limitId: string) => api.delete(`/budgets/${id}/limits/${limitId}`).then(r => r.data),
  transactions: (id: string, start?: string, end?: string, page=1) => {
    const params: Record<string, unknown> = { page };
    if (start) params.start = start;
    if (end) params.end = end;
    return api.get(`/budgets/${id}/transactions`, { params }).then(r => r.data.data ?? []);
  },
};
