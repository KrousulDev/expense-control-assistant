import { api } from '../lib/apiClient';
import type { Transaction } from '../types';

export interface ListTransactionsParams {
  page?: number;
  pageSize?: number;
  type?: 'expense' | 'income';
  from?: string;
  to?: string;
}

export interface CreateTransactionPayload {
  type: 'expense' | 'income';
  amount: number;
  currency?: string;
  description?: string;
  categoryId?: string;
  occurredAt?: string;
}

export interface UpdateTransactionPayload {
  type?: 'expense' | 'income';
  amount?: number;
  description?: string | null;
  categoryId?: string | null;
  occurredAt?: string;
  categoryOverridden?: boolean;
}

function buildQuery(params: ListTransactionsParams): string {
  const q = new URLSearchParams();
  if (params.page !== undefined) q.set('page', String(params.page));
  if (params.pageSize !== undefined) q.set('pageSize', String(params.pageSize));
  if (params.type) q.set('type', params.type);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

export const transactionsService = {
  list: (params: ListTransactionsParams = {}) =>
    api.get<Transaction[]>(`/transactions${buildQuery(params)}`),

  create: (payload: CreateTransactionPayload) =>
    api.post<Transaction>('/transactions', payload),

  update: (id: string, payload: UpdateTransactionPayload) =>
    api.put<Transaction>(`/transactions/${id}`, payload),

  remove: (id: string) => api.delete<void>(`/transactions/${id}`),
};
