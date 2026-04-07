-- ─────────────────────────────────────────────────────────────────
-- Expense Control — PostgreSQL schema (plain, no Supabase/RLS)
-- Auth is handled by the NestJS API layer with JWT.
-- ─────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum ('expense', 'income');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'source_channel') then
    create type public.source_channel as enum ('whatsapp', 'web', 'api');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'message_direction') then
    create type public.message_direction as enum ('inbound', 'outbound');
  end if;
end $$;

-- ── Trigger helper ────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Users (replaces auth.users) ───────────────────────────────────

create table if not exists public.users (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null unique,
  password_hash text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_email_lower check (email = lower(email))
);

create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- ── Profiles ─────────────────────────────────────────────────────

create table if not exists public.profiles (
  id                   uuid        primary key references public.users(id) on delete cascade,
  display_name         text,
  whatsapp_phone_e164  text        unique,
  default_currency     text        not null default 'MXN',
  timezone             text        not null default 'America/Mexico_City',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_default_currency_upper check (default_currency = upper(default_currency)),
  constraint profiles_default_currency_len   check (char_length(default_currency) = 3),
  constraint profiles_whatsapp_phone_format  check (
    whatsapp_phone_e164 is null or whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ── Categories ────────────────────────────────────────────────────

create table if not exists public.categories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references public.profiles(id) on delete cascade,
  name       text        not null,
  slug       text        not null,
  parent_id  uuid        references public.categories(id) on delete set null,
  is_system  boolean     not null default false,
  sort_order integer     not null default 0,
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

create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

-- ── Transactions ──────────────────────────────────────────────────

create table if not exists public.transactions (
  id                  uuid                    primary key default gen_random_uuid(),
  user_id             uuid                    not null references public.profiles(id) on delete cascade,
  type                public.transaction_type not null,
  amount              numeric(14,2)           not null check (amount > 0),
  currency            text                    not null,
  occurred_at         timestamptz             not null default now(),
  description         text,
  category_id         uuid                    references public.categories(id) on delete set null,
  source_channel      public.source_channel   not null default 'web',
  external_message_id text,
  raw_user_text       text,
  classification_meta jsonb                   not null default '{}'::jsonb,
  category_overridden boolean                 not null default false,
  created_at          timestamptz             not null default now(),
  updated_at          timestamptz             not null default now(),
  constraint transactions_currency_upper check (currency = upper(currency)),
  constraint transactions_currency_len   check (char_length(currency) = 3)
);

create index if not exists transactions_user_occurred_at_idx
  on public.transactions (user_id, occurred_at desc);

create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);

create unique index if not exists transactions_source_external_message_unique
  on public.transactions (source_channel, external_message_id)
  where external_message_id is not null;

create trigger set_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

-- ── Budgets ───────────────────────────────────────────────────────

create table if not exists public.budgets (
  id           uuid          primary key default gen_random_uuid(),
  user_id      uuid          not null references public.profiles(id) on delete cascade,
  category_id  uuid          references public.categories(id) on delete set null,
  month        date          not null,
  amount_limit numeric(14,2) not null check (amount_limit > 0),
  currency     text          not null,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  constraint budgets_month_is_first_day check (month = date_trunc('month', month)::date),
  constraint budgets_currency_upper     check (currency = upper(currency)),
  constraint budgets_currency_len       check (char_length(currency) = 3)
);

create unique index if not exists budgets_global_unique
  on public.budgets (user_id, month)
  where category_id is null;

create unique index if not exists budgets_category_unique
  on public.budgets (user_id, category_id, month)
  where category_id is not null;

create index if not exists budgets_user_month_idx
  on public.budgets (user_id, month);

create trigger set_budgets_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

-- ── Conversation messages (for external AI agent audit trail) ──────

create table if not exists public.conversation_messages (
  id                  uuid                     primary key default gen_random_uuid(),
  user_id             uuid                     not null references public.profiles(id) on delete cascade,
  direction           public.message_direction not null,
  body                text                     not null,
  external_message_id text,
  source_channel      public.source_channel    not null default 'api',
  transaction_id      uuid                     references public.transactions(id) on delete set null,
  created_at          timestamptz              not null default now(),
  metadata            jsonb                    not null default '{}'::jsonb,
  constraint conversation_body_non_empty check (length(trim(body)) > 0)
);

create index if not exists conversation_messages_user_created_at_idx
  on public.conversation_messages (user_id, created_at desc);

create index if not exists conversation_messages_transaction_idx
  on public.conversation_messages (transaction_id);

create unique index if not exists conversation_messages_source_external_message_unique
  on public.conversation_messages (source_channel, external_message_id)
  where external_message_id is not null;

-- ── Seed: system categories ───────────────────────────────────────

insert into public.categories (name, slug, is_system, user_id, sort_order)
values
  ('Comida',           'comida',           true, null,  10),
  ('Transporte',       'transporte',       true, null,  20),
  ('Vivienda',         'vivienda',         true, null,  30),
  ('Salud',            'salud',            true, null,  40),
  ('Entretenimiento',  'entretenimiento',  true, null,  50),
  ('Educacion',        'educacion',        true, null,  60),
  ('Servicios',        'servicios',        true, null,  70),
  ('Compras',          'compras',          true, null,  80),
  ('Deuda',            'deuda',            true, null,  90),
  ('Salario',          'salario',          true, null, 100),
  ('Otros_ingresos',   'otros_ingresos',   true, null, 110),
  ('Otros_gastos',     'otros_gastos',     true, null, 120)
on conflict (slug) where user_id is null
do update set
  name       = excluded.name,
  is_system  = true,
  sort_order = excluded.sort_order;
