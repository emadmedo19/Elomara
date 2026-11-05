-- Google-first onboarding foundation: building-wide codes and approval requests.
-- Existing data is intentionally preserved by this migration.

create table if not exists public.building_access_codes (
  building_id uuid primary key references public.buildings(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.building_join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  building_id uuid not null references public.buildings(id) on delete cascade,
  full_name text not null,
  requested_floor integer not null,
  requested_unit_number text not null,
  resident_type text not null check (resident_type in ('owner','tenant')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists building_join_requests_building_status_idx
  on public.building_join_requests(building_id, status, created_at desc);
create index if not exists building_join_requests_user_idx
  on public.building_join_requests(user_id, created_at desc);

alter table public.building_access_codes enable row level security;
alter table public.building_join_requests enable row level security;

drop policy if exists buildings_super_admin_delete on public.buildings;
drop policy if exists buildings_super_admin_insert on public.buildings;

create or replace function public.can_manage_bunyan_building(target_building_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.disabled_at is null
      and p.role = 'building_admin'
      and p.building_id = target_building_id
  );
$$;

create policy building_access_codes_manager_read
on public.building_access_codes for select to authenticated
using (public.can_manage_bunyan_building(building_id));

create policy building_join_requests_manager_read
on public.building_join_requests for select to authenticated
using (public.can_manage_bunyan_building(building_id));

create policy building_join_requests_own_read
on public.building_join_requests for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.create_or_rotate_building_access_code(target_building_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if auth.uid() is null or not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'غير مصرح بإدارة كود هذه العمارة' using errcode = '42501';
  end if;

  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.building_access_codes(building_id, code, created_by, created_at, revoked_at)
  values (target_building_id, new_code, auth.uid(), now(), null)
  on conflict (building_id) do update
    set code = excluded.code, created_by = excluded.created_by,
        created_at = excluded.created_at, revoked_at = null;
  return new_code;
end;
$$;

create or replace function public.revoke_building_access_code(target_building_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'غير مصرح بإدارة كود هذه العمارة' using errcode = '42501';
  end if;
  update public.building_access_codes set revoked_at = now()
  where building_id = target_building_id and revoked_at is null;
  return found;
end;
$$;

create or replace function public.submit_building_join_request(
  target_code text,
  applicant_full_name text,
  applicant_floor integer,
  applicant_unit_number text,
  applicant_resident_type text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  current_id uuid := auth.uid();
  target_building uuid;
  request_id uuid;
  profile_row public.profiles%rowtype;
begin
  if current_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if nullif(trim(applicant_full_name), '') is null or length(trim(applicant_full_name)) < 3 then
    raise exception 'اكتب الاسم بالكامل';
  end if;
  if applicant_floor < 0 or nullif(trim(applicant_unit_number), '') is null then
    raise exception 'راجع بيانات الدور ورقم الشقة';
  end if;
  if applicant_resident_type not in ('owner','tenant') then
    raise exception 'صفة الساكن غير صحيحة';
  end if;

  select c.building_id into target_building
  from public.building_access_codes c
  where upper(c.code) = upper(trim(target_code)) and c.revoked_at is null;
  if target_building is null then raise exception 'كود العمارة غير صحيح أو تم إلغاؤه'; end if;

  select * into profile_row from public.profiles p where p.id = current_id for update;
  if not found or profile_row.disabled_at is not null or profile_row.approved
     or profile_row.role <> 'pending' or profile_row.building_id is not null then
    raise exception 'الحساب غير مؤهل لإرسال طلب انضمام';
  end if;

  if exists (
    select 1 from public.building_join_requests r
    where r.user_id = current_id and r.status = 'pending'
  ) then raise exception 'لديك طلب انضمام قيد المراجعة بالفعل'; end if;

  insert into public.building_join_requests(
    user_id, building_id, full_name, requested_floor, requested_unit_number, resident_type
  ) values (
    current_id, target_building, trim(applicant_full_name), applicant_floor,
    trim(applicant_unit_number), applicant_resident_type
  ) returning id into request_id;

  update public.profiles set full_name = trim(applicant_full_name), updated_at = now()
  where id = current_id;
  return request_id;
end;
$$;

create or replace function public.approve_building_join_request(
  target_request_id uuid,
  target_apartment_id uuid
)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  request_row public.building_join_requests%rowtype;
  apartment_row public.apartments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into request_row from public.building_join_requests
  where id = target_request_id for update;
  if not found or not public.can_manage_bunyan_building(request_row.building_id) then
    raise exception 'طلب الانضمام غير موجود أو غير مصرح به' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then raise exception 'تمت مراجعة هذا الطلب بالفعل'; end if;

  select * into apartment_row from public.apartments
  where id = target_apartment_id and building_id = request_row.building_id for update;
  if not found then raise exception 'الشقة المختارة لا تتبع هذه العمارة'; end if;

  update public.profiles
  set full_name = request_row.full_name,
      role = request_row.resident_type,
      approved = true,
      building_id = request_row.building_id,
      apartment_id = target_apartment_id,
      updated_at = now()
  where id = request_row.user_id
    and role = 'pending' and approved = false
    and building_id is null and disabled_at is null;
  if not found then raise exception 'حساب الساكن لم يعد في حالة انتظار'; end if;

  update public.apartments
  set resident_name = request_row.full_name,
      is_owner = (request_row.resident_type = 'owner'),
      updated_at = now()
  where id = target_apartment_id and building_id = request_row.building_id;

  update public.building_join_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_request_id;
  return true;
end;
$$;

create or replace function public.reject_building_join_request(target_request_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  request_row public.building_join_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into request_row from public.building_join_requests
  where id = target_request_id for update;
  if not found or not public.can_manage_bunyan_building(request_row.building_id) then
    raise exception 'طلب الانضمام غير موجود أو غير مصرح به' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then raise exception 'تمت مراجعة هذا الطلب بالفعل'; end if;

  update public.building_join_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_request_id;
  return true;
end;
$$;

-- Disable every legacy path that can grant global administrator access or bypass the
-- new building-wide, manager-approved onboarding flow.
revoke all on function public.bootstrap_first_super_admin() from public, anon, authenticated;
revoke all on function public.approve_registration_as_super_admin(uuid) from public, anon, authenticated;
revoke all on function public.set_bunyan_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.create_building_invite(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_building_phone_invite(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.accept_building_invite(uuid) from public, anon, authenticated;

revoke all on function public.create_or_rotate_building_access_code(uuid) from public, anon;
revoke all on function public.revoke_building_access_code(uuid) from public, anon;
revoke all on function public.submit_building_join_request(text, text, integer, text, text) from public, anon;
revoke all on function public.approve_building_join_request(uuid, uuid) from public, anon;
revoke all on function public.reject_building_join_request(uuid) from public, anon;

grant execute on function public.create_or_rotate_building_access_code(uuid) to authenticated;
grant execute on function public.revoke_building_access_code(uuid) to authenticated;
grant execute on function public.submit_building_join_request(text, text, integer, text, text) to authenticated;
grant execute on function public.approve_building_join_request(uuid, uuid) to authenticated;
grant execute on function public.reject_building_join_request(uuid) to authenticated;
