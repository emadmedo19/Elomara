alter table public.buildings add column if not exists latitude double precision, add column if not exists longitude double precision;
create or replace function public.set_building_location(target_building_id uuid, new_latitude double precision, new_longitude double precision)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if new_latitude is null or new_longitude is null or new_latitude not between -90 and 90 or new_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and building_id=target_building_id and role='manager') then raise exception 'Access denied'; end if;
 update public.buildings set latitude=new_latitude,longitude=new_longitude where id=target_building_id;
end; $$;
revoke all on function public.set_building_location(uuid,double precision,double precision) from public,anon;
grant execute on function public.set_building_location(uuid,double precision,double precision) to authenticated;