import { api, setToken, clearToken } from '../lib/apiClient';
import type { AuthResponse } from '../types';

export const authService = {
  async register(email: string, password: string): Promise<void> {
    const res = await api.post<AuthResponse>('/auth/register', { email, password });
    setToken(res.accessToken);
  },

  async login(email: string, password: string): Promise<void> {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    setToken(res.accessToken);
  },

  logout(): void {
    clearToken();
  },
};
