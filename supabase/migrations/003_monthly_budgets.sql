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

create policy "Users manage own budgets"
  on public.monthly_budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
