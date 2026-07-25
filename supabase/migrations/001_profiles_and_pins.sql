-- FINPA profiles + activation pins

create extension if not exists "pgcrypto";

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
  created_at timestamptz not null default now()
);

create index if not exists activation_pins_code_idx on public.activation_pins (code);

alter table public.profiles enable row level security;
alter table public.activation_pins enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Pins are managed by service role only (no client policies for insert/update)

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
