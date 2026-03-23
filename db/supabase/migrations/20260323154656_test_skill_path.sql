create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'transaction_type' and n.nspname = 'public'
  ) then
    create type public.transaction_type as enum ('expense', 'income');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'source_channel' and n.nspname = 'public'
  ) then
    create type public.source_channel as enum ('whatsapp', 'web', 'api');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'message_direction' and n.nspname = 'public'
  ) then
    create type public.message_direction as enum ('inbound', 'outbound');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  whatsapp_phone_e164 text unique,
  default_currency text not null default 'MXN',
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_default_currency_upper check (default_currency = upper(default_currency)),
  constraint profiles_default_currency_len check (char_length(default_currency) = 3),
  constraint profiles_whatsapp_phone_format check (
    whatsapp_phone_e164 is null or whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  parent_id uuid references public.categories(id) on delete set null,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_non_empty check (length(trim(name)) > 0),
  constraint categories_slug_non_empty check (length(trim(slug)) > 0),
  constraint categories_system_user_guard check (
    (is_system = true and user_id is null) or (is_system = false and user_id is not null)
  )
);

create unique index if not exists categories_user_slug_unique
  on public.categories (user_id, slug);

create unique index if not exists categories_system_slug_unique
  on public.categories (slug)
  where user_id is null;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null,
  occurred_at timestamptz not null default now(),
  description text,
  category_id uuid references public.categories(id) on delete set null,
  source_channel public.source_channel not null default 'web',
  external_message_id text,
  raw_user_text text,
  classification_meta jsonb not null default '{}'::jsonb,
  category_overridden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_currency_upper check (currency = upper(currency)),
  constraint transactions_currency_len check (char_length(currency) = 3)
);

create index if not exists transactions_user_occurred_at_idx
  on public.transactions (user_id, occurred_at desc);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);

create unique index if not exists transactions_source_external_message_unique
  on public.transactions (source_channel, external_message_id)
  where external_message_id is not null;

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  month date not null,
  amount_limit numeric(14,2) not null check (amount_limit > 0),
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_is_first_day check (month = date_trunc('month', month)::date),
  constraint budgets_currency_upper check (currency = upper(currency)),
  constraint budgets_currency_len check (char_length(currency) = 3)
);

create unique index if not exists budgets_global_unique
  on public.budgets (user_id, month)
  where category_id is null;

create unique index if not exists budgets_category_unique
  on public.budgets (user_id, category_id, month)
  where category_id is not null;

create index if not exists budgets_user_month_idx
  on public.budgets (user_id, month);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  direction public.message_direction not null,
  body text not null,
  external_message_id text,
  source_channel public.source_channel not null default 'whatsapp',
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint conversation_body_non_empty check (length(trim(body)) > 0)
);

create index if not exists conversation_messages_user_created_at_idx
  on public.conversation_messages (user_id, created_at desc);

create index if not exists conversation_messages_transaction_idx
  on public.conversation_messages (transaction_id);

create unique index if not exists conversation_messages_source_external_message_unique
  on public.conversation_messages (source_channel, external_message_id)
  where external_message_id is not null;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_categories_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

create trigger set_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();

create trigger set_budgets_updated_at
before update on public.budgets
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.conversation_messages enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists categories_select_visible on public.categories;
create policy categories_select_visible
  on public.categories
  for select
  using (is_system = true or user_id = auth.uid());

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own
  on public.categories
  for insert
  with check (is_system = false and user_id = auth.uid());

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own
  on public.categories
  for update
  using (is_system = false and user_id = auth.uid())
  with check (is_system = false and user_id = auth.uid());

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own
  on public.categories
  for delete
  using (is_system = false and user_id = auth.uid());

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own
  on public.transactions
  for select
  using (user_id = auth.uid());

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own
  on public.transactions
  for insert
  with check (user_id = auth.uid());

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own
  on public.transactions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own
  on public.transactions
  for delete
  using (user_id = auth.uid());

drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own
  on public.budgets
  for select
  using (user_id = auth.uid());

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own
  on public.budgets
  for insert
  with check (user_id = auth.uid());

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own
  on public.budgets
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own
  on public.budgets
  for delete
  using (user_id = auth.uid());

drop policy if exists messages_select_own on public.conversation_messages;
create policy messages_select_own
  on public.conversation_messages
  for select
  using (user_id = auth.uid());

drop policy if exists messages_insert_own on public.conversation_messages;
create policy messages_insert_own
  on public.conversation_messages
  for insert
  with check (user_id = auth.uid());

drop policy if exists messages_update_own on public.conversation_messages;
create policy messages_update_own
  on public.conversation_messages
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists messages_delete_own on public.conversation_messages;
create policy messages_delete_own
  on public.conversation_messages
  for delete
  using (user_id = auth.uid());

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

comment on function public.handle_auth_user_created() is
'Creates profile rows for new auth users. WhatsApp webhooks should run with service role or SECURITY DEFINER RPC to bypass end-user RLS safely.';

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.conversation_messages to authenticated;
