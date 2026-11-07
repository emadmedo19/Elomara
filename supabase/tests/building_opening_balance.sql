-- Regression checks: creates only temporary fixtures, rolls everything back.
begin;
do $$
declare
  test_user uuid := gen_random_uuid();
  test_building uuid;
  second_user uuid := gen_random_uuid();
  invalid_amount numeric;
  initial_building_count bigint := (select count(*) from public.buildings);
begin
  if has_function_privilege('anon', 'public.create_building_with_opening_balance(text,text,integer,integer,numeric)', 'execute')
     or not has_function_privilege('authenticated', 'public.create_building_with_opening_balance(text,text,integer,integer,numeric)', 'execute') then
    raise exception 'Incorrect RPC grants';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.create_building_with_opening_balance('Opening balance test');
    raise exception 'Anonymous creation was accepted';
  exception when insufficient_privilege then null;
  end;

  insert into auth.users(id, email_confirmed_at, raw_user_meta_data)
    values (test_user, now(), '{"full_name":"Opening balance regression"}');
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  foreach invalid_amount in array array[-1::numeric, 1.001, 'NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric, 10000000000, null] loop
    begin
      perform public.create_building_with_opening_balance('Opening balance test', opening_balance => invalid_amount);
      raise exception 'Invalid balance was accepted: %', invalid_amount;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  if (select count(*) from public.buildings) <> initial_building_count then
    raise exception 'Invalid input created a building';
  end if;
  test_building := public.create_building_with_opening_balance('Opening balance test', '', 2, 1, 1250.75);
  if (select balance from public.buildings where id = test_building) <> 1250.75
     or (select count(*) from public.apartments where building_id = test_building) <> 2
     or not exists (select 1 from public.profiles where id = test_user and role = 'building_admin' and approved and building_id = test_building)
     or exists (select 1 from public.payments where building_id = test_building) then
    raise exception 'Balance, onboarding, apartments or collection isolation failed';
  end if;
  begin
    perform public.create_building_with_opening_balance('Duplicate test', opening_balance => 999);
    raise exception 'Duplicate creation was accepted';
  exception when raise_exception then
    if sqlerrm <> 'This account is not eligible to create a building' then raise; end if;
  end;
  if (select balance from public.buildings where id = test_building) <> 1250.75 then
    raise exception 'Duplicate submission changed treasury';
  end if;

  insert into auth.users(id, email_confirmed_at) values (second_user, now());
  perform set_config('request.jwt.claim.sub', second_user::text, true);
  test_building := public.create_building_with_opening_balance('Zero opening balance test');
  if (select balance from public.buildings where id = test_building) <> 0 then
    raise exception 'Default balance is not zero';
  end if;
  second_user := gen_random_uuid();
  insert into auth.users(id, email_confirmed_at) values (second_user, now());
  perform set_config('request.jwt.claim.sub', second_user::text, true);
  test_building := public.create_building_for_current_user('Legacy onboarding test');
  if (select balance from public.buildings where id = test_building) <> 0 then
    raise exception 'Legacy onboarding balance changed';
  end if;
end;
$$;
rollback;
select 'PASS opening balance, validation, permissions, duplicate submission, default zero, legacy onboarding; fixtures rolled back' as result;
