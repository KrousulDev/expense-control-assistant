import { api } from '../lib/apiClient';
import type { Category } from '../types';

export const categoriesService = {
  list: () => api.get<Category[]>('/categories'),
};
