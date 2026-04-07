export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  whatsapp_phone_e164: string | null;
  default_currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'expense' | 'income';
export type SourceChannel = 'whatsapp' | 'web' | 'api';

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: string;
  currency: string;
  occurred_at: string;
  description: string | null;
  category_id: string | null;
  source_channel: SourceChannel;
  external_message_id: string | null;
  raw_user_text: string | null;
  classification_meta: Record<string, unknown>;
  category_overridden: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  parent_id: string | null;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  month: string;
  amount_limit: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  accessToken: string;
}
