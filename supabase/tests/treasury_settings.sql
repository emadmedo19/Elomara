begin;
do $$
declare
  manager uuid := gen_random_uuid();
  legacy_manager uuid := gen_random_uuid();
  resident uuid := gen_random_uuid();
  add_manager uuid := gen_random_uuid();
  add_building uuid;
  building uuid;
  legacy_building uuid;
  result jsonb;
  invalid_amount numeric;
begin
  if has_function_privilege('anon', 'public.update_building_treasury_settings(uuid,numeric,numeric,numeric,numeric,numeric,boolean)', 'execute') then
    raise exception 'Anonymous RPC grant';
  end if;
  insert into auth.users(id,email_confirmed_at) values (manager,now()),(legacy_manager,now()),(resident,now());
  perform set_config('request.jwt.claim.sub',manager::text,true);
  building := public.create_building_with_opening_balance('Treasury settings test','',1,1,1000);
  if (select opening_balance from public.buildings where id=building) <> 1000 then raise exception 'Initial opening balance not saved'; end if;
  result := public.update_building_treasury_settings(building,1200,300,1000,1000,0);
  if (result->>'balance')::numeric <> 1200 or (result->>'reserve_fund')::numeric <> 300 then raise exception 'Incorrect balance delta'; end if;
  perform public.update_building_treasury_settings(building,1200,300,1200,1200,300);
  if (select count(*) from public.building_treasury_settings_audit where building_id=building) <> 1 then raise exception 'No-op wrote duplicate audit'; end if;
  begin
    perform public.update_building_treasury_settings(building,1300,300,1000,1000,0);
    raise exception 'Stale update accepted';
  exception when serialization_failure then null; end;
  foreach invalid_amount in array array[-1::numeric,1.001,'NaN'::numeric,'Infinity'::numeric,10000000000,null] loop
    begin
      perform public.update_building_treasury_settings(building,invalid_amount,300,1200,1200,300);
      raise exception 'Invalid amount accepted';
    exception when invalid_parameter_value then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub',legacy_manager::text,true);
  legacy_building := public.create_building_for_current_user('Legacy treasury settings test');
  -- Model historical cash which may already include the opening amount.
  update public.buildings set balance=500 where id=legacy_building;
  begin
    perform public.update_building_treasury_settings(legacy_building,500,100,500,null,0);
    raise exception 'Unknown history silently credited';
  exception when invalid_parameter_value then null; end;
  result := public.update_building_treasury_settings(legacy_building,500,100,500,null,0,true);
  if (result->>'balance')::numeric <> 500 then raise exception 'Historical cash double-credited'; end if;
  begin
    perform public.update_building_treasury_settings(building,1500,300,1200,1200,300);
    raise exception 'Cross-building update accepted';
  exception when insufficient_privilege then null; end;
  insert into auth.users(id,email_confirmed_at) values(add_manager,now());
  perform set_config('request.jwt.claim.sub',add_manager::text,true);
  add_building := public.create_building_for_current_user('Add historical opening balance test');
  result := public.update_building_treasury_settings(add_building,250,50,0,null,0,false);
  if (result->>'balance')::numeric <> 250 then raise exception 'Historical add option failed'; end if;
  perform set_config('request.jwt.claim.sub',resident::text,true);
  update public.profiles set role='owner',approved=true,building_id=building,
    apartment_id=(select id from public.apartments where building_id=building limit 1) where id=resident;
  begin
    perform public.update_building_treasury_settings(building,1500,300,1200,1200,300);
    raise exception 'Resident updated treasury';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.update_building_treasury_settings(building,1500,300,1200,1200,300);
    raise exception 'Unauthenticated treasury update accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',manager::text,true);
  update public.buildings set balance=20 where id=building;
  begin
    perform public.update_building_treasury_settings(building,0,300,20,1200,300);
    raise exception 'Negative resulting treasury accepted';
  exception when invalid_parameter_value then null; end;
  if (select balance from public.buildings where id=building) <> 20
     or exists(select 1 from public.payments where building_id in (building,legacy_building)) then
    raise exception 'Financial rollback or collection isolation failed';
  end if;
end;
$$;
-- Exercise the real authenticated role, including RLS on the audit trail.
set local role authenticated;
do $$
begin
  if (select count(*) from public.building_treasury_settings_audit) <> 1 then
    raise exception 'Audit rows leaked across buildings or own audit is missing';
  end if;
  begin
    insert into public.building_treasury_settings_audit default values;
    raise exception 'Client inserted an audit record';
  exception when insufficient_privilege then null; end;
end;
$$;
rollback;
select 'PASS initial balance, delta, deposit, no-op, stale writes, invalid amounts, legacy no double credit, manager isolation, resident denial, negative treasury and rollback' as result;
