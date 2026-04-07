import { api } from '../lib/apiClient';
import type { Budget } from '../types';

export interface CreateBudgetPayload {
  month: string;
  amountLimit: number;
  currency?: string;
  categoryId?: string | null;
}

export const budgetsService = {
  list: (month?: string) => {
    const qs = month ? `?month=${encodeURIComponent(month)}` : '';
    return api.get<Budget[]>(`/budgets${qs}`);
  },

  create: (payload: CreateBudgetPayload) =>
    api.post<Budget>('/budgets', payload),

  remove: (id: string) => api.delete<void>(`/budgets/${id}`),
};
