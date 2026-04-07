import { api } from '../lib/apiClient';
import type { Profile } from '../types';

export interface UpdateProfilePayload {
  displayName?: string | null;
  whatsappPhoneE164?: string | null;
  defaultCurrency?: string;
  timezone?: string;
}

export const profileService = {
  get: () => api.get<Profile>('/profile'),
  update: (payload: UpdateProfilePayload) => api.put<Profile>('/profile', payload),
};
