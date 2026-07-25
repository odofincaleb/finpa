-- FINPA — run once in Supabase SQL Editor (Dashboard → SQL → New query)
-- Creates profiles, pins, transactions, budgets, RLS, auth trigger, demo PIN.

create extension if not exists "pgcrypto";

-- ─── profiles + pins ───────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  preferred_currency text not null default 'NGN',
  subscription_period text check (subscription_period in ('monthly', 'annual')),
  subscription_expires_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activation_pins (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  period text not null check (period in ('monthly', 'annual')),
  duration_days int not null,
  redeemed_by uuid references public.profiles (id),
  redeemed_at timestamptz,
  expires_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.activation_pins
  add column if not exists notes text not null default '';

create index if not exists activation_pins_code_idx on public.activation_pins (code);

alter table public.profiles enable row level security;
alter table public.activation_pins enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, preferred_currency)
  values (new.id, coalesce(new.email, ''), 'NGN')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── transactions ───────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null,
  currency text not null default 'NGN',
  category text not null,
  merchant text not null default '',
  type text not null check (type in ('expense', 'income')),
  payment_method text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

alter table public.transactions enable row level security;

drop policy if exists "Users manage own transactions" on public.transactions;
create policy "Users manage own transactions"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.transactions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- ─── monthly budgets ────────────────────────────────────────────────────────
create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  category text not null,
  budget_amount numeric not null default 0,
  currency text not null default 'NGN',
  unique (user_id, year, month, category)
);

create index if not exists monthly_budgets_user_period_idx
  on public.monthly_budgets (user_id, year, month);

alter table public.monthly_budgets enable row level security;

drop policy if exists "Users manage own budgets" on public.monthly_budgets;
create policy "Users manage own budgets"
  on public.monthly_budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── seed demo PIN ──────────────────────────────────────────────────────────
insert into public.activation_pins (code, period, duration_days)
values ('FINPA-DEMO-0001', 'monthly', 30)
on conflict (code) do nothing;
