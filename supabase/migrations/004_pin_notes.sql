-- Optional label / sold-to note on activation pins
alter table public.activation_pins
  add column if not exists notes text not null default '';
