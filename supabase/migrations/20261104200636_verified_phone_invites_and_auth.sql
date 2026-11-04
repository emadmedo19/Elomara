-- Verified phone invitations for Elomara / العمارة.
-- Backwards-compatible: existing email invitations and their UUID codes remain valid.

alter table public.building_invites
  alter column invited_email drop not null,
  add column if not exists invited_phone text,
  add column if not exists invited_name text;

create index if not exists building_invites_phone_idx
  on public.building_invites (invited_phone)
  where invited_phone is not null;

create or replace function public.normalize_egyptian_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if left(digits, 4) = '0020' then
    digits := substr(digits, 3);
  end if;

  if length(digits) = 12 and left(digits, 3) = '201' then
    return '+' || digits;
  end if;

  if length(digits) = 11 and left(digits, 2) = '01' then
    return '+2' || digits;
  end if;

  raise exception 'أدخل رقم موبايل مصري صحيح.';
end;
$$;

revoke all on function public.normalize_egyptian_phone(text) from public, anon;
grant execute on function public.normalize_egyptian_phone(text) to authenticated;

create or replace function public.create_building_phone_invite(
  target_building_id uuid,
  target_apartment_id uuid,
  target_phone text,
  target_name text
)
returns table(invite_code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_phone text := public.normalize_egyptian_phone(target_phone);
  normalized_name text := nullif(trim(target_name), '');
  created_code uuid;
  expiry timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'Not authorized to manage this building';
  end if;

  if normalized_name is null or length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'اكتب اسم الساكن بشكل صحيح.';
  end if;

  if not exists (
    select 1 from public.apartments a
    where a.id = target_apartment_id
      and a.building_id = target_building_id
  ) then
    raise exception 'Apartment does not belong to this building';
  end if;

  insert into public.building_invites (
    building_id, apartment_id, invited_email, invited_phone, invited_name,
    invited_by, expires_at
  )
  values (
    target_building_id, target_apartment_id, null, normalized_phone, normalized_name,
    auth.uid(), now() + interval '48 hours'
  )
  returning building_invites.invite_code, building_invites.expires_at
  into created_code, expiry;

  return query select 'PH-' || created_code::text, expiry;
end;
$$;

revoke all on function public.create_building_phone_invite(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_building_phone_invite(uuid, uuid, text, text) to authenticated;

create or replace function public.accept_building_phone_invite(target_invite_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid := auth.uid();
  current_phone text;
  phone_confirmed_at timestamptz;
  invite_uuid uuid;
  invite_row public.building_invites%rowtype;
  apartment_owner boolean;
  profile_row public.profiles%rowtype;
begin
  if current_id is null then
    raise exception 'Authentication required';
  end if;

  if target_invite_code !~* '^PH-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'كود الدعوة غير صحيح.';
  end if;
  invite_uuid := substring(target_invite_code from 4)::uuid;

  select public.normalize_egyptian_phone(u.phone), u.phone_confirmed_at
    into current_phone, phone_confirmed_at
  from auth.users u
  where u.id = current_id;

  if current_phone is null or phone_confirmed_at is null then
    raise exception 'يجب تأكيد رقم الموبايل برسالة SMS أولاً.';
  end if;

  select * into invite_row
  from public.building_invites i
  where i.invite_code = invite_uuid
    and i.invited_phone = current_phone
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'الدعوة غير صالحة أو منتهية أو مخصصة لرقم موبايل آخر.';
  end if;

  select * into profile_row
  from public.profiles p
  where p.id = current_id
  for update;

  if not found
     or profile_row.role <> 'pending'
     or profile_row.approved
     or profile_row.disabled_at is not null
     or profile_row.building_id is not null then
    raise exception 'هذا الحساب مرتبط بعقار بالفعل أو غير مؤهل لقبول الدعوة.';
  end if;

  select a.is_owner into apartment_owner
  from public.apartments a
  where a.id = invite_row.apartment_id
    and a.building_id = invite_row.building_id;

  if not found then
    raise exception 'الشقة المرتبطة بالدعوة لم تعد متاحة.';
  end if;

  update public.profiles
  set full_name = coalesce(invite_row.invited_name, full_name),
      phone = current_phone,
      role = case when apartment_owner then 'owner' else 'tenant' end,
      approved = true,
      building_id = invite_row.building_id,
      apartment_id = invite_row.apartment_id,
      updated_at = now()
  where id = current_id;

  update public.apartments
  set resident_name = coalesce(invite_row.invited_name, resident_name),
      resident_phone = current_phone,
      updated_at = now()
  where id = invite_row.apartment_id
    and building_id = invite_row.building_id;

  update public.building_invites
  set accepted_at = now()
  where id = invite_row.id;

  return true;
end;
$$;

revoke all on function public.accept_building_phone_invite(text) from public, anon;
grant execute on function public.accept_building_phone_invite(text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.phone, ''),
    'pending',
    false
  )
  on conflict (id) do update
    set phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end,
        updated_at = now();

  return new;
end;
$$;
