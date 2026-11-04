-- Rate-limit public phone account creation without storing raw phone numbers or IP addresses.
create table if not exists public.phone_signup_rate_limits (
  rate_key text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.phone_signup_rate_limits enable row level security;
revoke all on public.phone_signup_rate_limits from public, anon, authenticated;

create or replace function public.consume_phone_signup_rate_limit(
  phone_key_hash text,
  ip_key_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_time timestamptz := now();
  phone_attempts integer;
  ip_attempts integer;
begin
  if phone_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid phone rate-limit key';
  end if;

  insert into public.phone_signup_rate_limits(rate_key, window_started_at, attempts, updated_at)
  values ('phone:' || phone_key_hash, current_time, 1, current_time)
  on conflict (rate_key) do update
    set attempts = case
          when public.phone_signup_rate_limits.window_started_at <= current_time - interval '1 hour' then 1
          else public.phone_signup_rate_limits.attempts + 1
        end,
        window_started_at = case
          when public.phone_signup_rate_limits.window_started_at <= current_time - interval '1 hour' then current_time
          else public.phone_signup_rate_limits.window_started_at
        end,
        updated_at = current_time
  returning attempts into phone_attempts;

  if ip_key_hash is not null then
    if ip_key_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid IP rate-limit key';
    end if;
    insert into public.phone_signup_rate_limits(rate_key, window_started_at, attempts, updated_at)
    values ('ip:' || ip_key_hash, current_time, 1, current_time)
    on conflict (rate_key) do update
      set attempts = case
            when public.phone_signup_rate_limits.window_started_at <= current_time - interval '1 hour' then 1
            else public.phone_signup_rate_limits.attempts + 1
          end,
          window_started_at = case
            when public.phone_signup_rate_limits.window_started_at <= current_time - interval '1 hour' then current_time
            else public.phone_signup_rate_limits.window_started_at
          end,
          updated_at = current_time
    returning attempts into ip_attempts;
  end if;

  return phone_attempts <= 5 and (ip_key_hash is null or ip_attempts <= 30);
end;
$function$;

revoke all on function public.consume_phone_signup_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_phone_signup_rate_limit(text, text) to service_role;
