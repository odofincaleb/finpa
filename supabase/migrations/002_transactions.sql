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

create policy "Users manage own transactions"
  on public.transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable realtime (run in Supabase dashboard if needed)
-- alter publication supabase_realtime add table public.transactions;
