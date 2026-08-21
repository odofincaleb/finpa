-- FINPA TASK-009: Paystack PIN sales automation
-- Run in Supabase SQL Editor after existing activation_pins migrations.

create extension if not exists "pgcrypto";

create table if not exists public.pin_sales (
  id uuid primary key default gen_random_uuid(),
  pin_code text not null unique references public.activation_pins (code) on delete restrict,
  plan_id text not null check (plan_id in (
    'monthly_ngn',
    'annual_ngn',
    'launch_annual_ngn',
    'monthly_usd',
    'annual_usd',
    'launch_annual_usd'
  )),
  period text not null check (period in ('monthly', 'annual')),
  duration_days int not null,
  buyer_email text not null,
  buyer_name text not null default '',
  buyer_phone text not null default '',
  currency text not null check (currency in ('NGN', 'USD')),
  amount_paid int not null,
  paystack_reference text not null unique,
  paystack_status text not null,
  source text not null default 'paystack' check (source = 'paystack'),
  sold_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists pin_sales_pin_code_idx on public.pin_sales (pin_code);
create index if not exists pin_sales_buyer_email_idx on public.pin_sales (buyer_email);
create index if not exists pin_sales_sold_at_idx on public.pin_sales (sold_at desc);

alter table public.pin_sales enable row level security;

-- No client-side policies: FINPA backend service role is the only writer/reader for payment metadata.
