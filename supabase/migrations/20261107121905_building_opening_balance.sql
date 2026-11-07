-- Keep the original onboarding RPC available for installed older bundles.
-- Both building creation and treasury initialization commit or roll back together.
-- No payment is inserted: opening cash must not inflate resident collections.
create or replace function public.create_building_with_opening_balance(
  building_name text,
  building_address text default '',
  units_count integer default 0,
  floors_count integer default null,
  opening_balance numeric default 0
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_building_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Comparisons also reject NaN and infinities without silently rounding cash.
  if opening_balance is null or not (opening_balance between 0 and 9999999999.99)
     or opening_balance <> round(opening_balance, 2) then
    raise exception 'الرصيد الافتتاحي غير صحيح؛ أدخل مبلغًا من صفر إلى 9,999,999,999.99 بمنزلتين عشريتين كحد أقصى'
      using errcode = '22023';
  end if;

  -- Reuse the confirmed-identity and pending-profile checks, including its row
  -- lock. A repeated/concurrent submission cannot create or credit twice.
  new_building_id := public.create_building_for_current_user(
    building_name, building_address, units_count, floors_count
  );
  update public.buildings set balance = opening_balance
  where id = new_building_id;
  return new_building_id;
end;
$$;

revoke all on function public.create_building_with_opening_balance(text, text, integer, integer, numeric) from public, anon;
grant execute on function public.create_building_with_opening_balance(text, text, integer, integer, numeric) to authenticated;
