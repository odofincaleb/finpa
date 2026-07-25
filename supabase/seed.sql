-- Demo activation PIN (same as memory-mode fallback)
insert into public.activation_pins (code, period, duration_days)
values ('FINPA-DEMO-0001', 'monthly', 30)
on conflict (code) do nothing;
