-- Prevent assigning the same apartment to multiple active resident accounts.
create unique index if not exists profiles_one_active_resident_per_apartment
  on public.profiles (apartment_id)
  where approved = true
    and disabled_at is null
    and role in ('owner', 'tenant')
    and apartment_id is not null;

create or replace function public.approve_building_join_request(
  target_request_id uuid,
  target_apartment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.building_join_requests%rowtype;
  apartment_row public.apartments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into request_row
  from public.building_join_requests
  where id = target_request_id
  for update;

  if not found or not public.can_manage_bunyan_building(request_row.building_id) then
    raise exception 'طلب الانضمام غير موجود أو غير مصرح به' using errcode = '42501';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'تمت مراجعة هذا الطلب بالفعل';
  end if;

  select * into apartment_row
  from public.apartments
  where id = target_apartment_id
    and building_id = request_row.building_id
  for update;

  if not found then
    raise exception 'الشقة المختارة لا تتبع هذه العمارة';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.apartment_id = target_apartment_id
      and p.approved = true
      and p.disabled_at is null
      and p.role in ('owner', 'tenant')
      and p.id <> request_row.user_id
  ) then
    raise exception 'الشقة مرتبطة بالفعل بحساب ساكن معتمد. راجع الحساب الحالي قبل إعادة التخصيص';
  end if;

  update public.profiles
  set full_name = request_row.full_name,
      role = request_row.resident_type,
      approved = true,
      building_id = request_row.building_id,
      apartment_id = target_apartment_id,
      updated_at = now()
  where id = request_row.user_id
    and role = 'pending'
    and approved = false
    and building_id is null
    and disabled_at is null;

  if not found then
    raise exception 'حساب الساكن لم يعد في حالة انتظار';
  end if;

  update public.apartments
  set resident_name = request_row.full_name,
      is_owner = (request_row.resident_type = 'owner'),
      updated_at = now()
  where id = target_apartment_id
    and building_id = request_row.building_id;

  update public.building_join_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = target_request_id;

  return true;
end;
$function$;
