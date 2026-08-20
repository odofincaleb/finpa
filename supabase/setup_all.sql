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

-- ─── PIN redemption RPC (service role) ──────────────────────────────────────
create or replace function public.redeem_activation_pin(
  p_code text,
  p_user_id uuid,
  p_allow_demo boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin public.activation_pins%rowtype;
  v_profile public.profiles%rowtype;
  v_base timestamptz;
  v_expires timestamptz;
  v_normalized text;
  v_is_demo boolean;
  v_updated int;
begin
  v_normalized := upper(trim(p_code));
  v_is_demo := v_normalized like 'FINPA-DEMO-%';

  if v_is_demo and not p_allow_demo then
    raise exception 'PIN_INVALID' using errcode = 'P0001';
  end if;

  select * into v_pin
  from public.activation_pins
  where code = v_normalized
  for update;

  if not found then
    raise exception 'PIN_INVALID' using errcode = 'P0001';
  end if;

  if v_pin.redeemed_by is not null and not v_is_demo then
    raise exception 'PIN_INVALID' using errcode = 'P0001';
  end if;

  if v_pin.expires_at is not null and v_pin.expires_at < now() then
    raise exception 'PIN_INVALID' using errcode = 'P0001';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'PIN_INVALID' using errcode = 'P0001';
  end if;

  v_base := greatest(now(), coalesce(v_profile.subscription_expires_at, now()));
  v_expires := v_base + make_interval(days => v_pin.duration_days);

  if not v_is_demo then
    update public.activation_pins
    set redeemed_by = p_user_id,
        redeemed_at = now()
    where id = v_pin.id
      and redeemed_by is null;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'PIN_INVALID' using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
  set
    subscription_period = v_pin.period,
    subscription_expires_at = v_expires,
    activated_at = coalesce(v_profile.activated_at, now())
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.redeem_activation_pin(text, uuid, boolean) from public;
grant execute on function public.redeem_activation_pin(text, uuid, boolean) to service_role;

-- Demo PIN seed is opt-in only (ALLOW_DEMO_PINS=true on backend). Do not insert by default.
