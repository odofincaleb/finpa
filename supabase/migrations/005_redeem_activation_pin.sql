-- Atomic PIN redemption (service role via backend)

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
