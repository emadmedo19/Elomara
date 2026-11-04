-- Phone-bound apartment invitations. Kept separate from legacy email invitations.
create table if not exists public.building_phone_invites (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  apartment_id uuid not null references public.apartments(id) on delete cascade,
  invited_phone text not null,
  invited_name text not null,
  invite_code_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists building_phone_invites_building_idx
  on public.building_phone_invites(building_id);
create index if not exists building_phone_invites_phone_idx
  on public.building_phone_invites(invited_phone);
alter table public.building_phone_invites enable row level security;
revoke all on public.building_phone_invites from public, anon, authenticated;

create or replace function public.normalize_egyptian_phone(raw_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare digits text := regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g');
begin
  if digits ~ '^01[0125][0-9]{8}$' then
    return '+2' || digits;
  elsif digits ~ '^201[0125][0-9]{8}$' then
    return '+' || digits;
  elsif digits ~ '^00201[0125][0-9]{8}$' then
    return '+' || substring(digits from 3);
  end if;
  raise exception 'Enter a valid Egyptian mobile number';
end;
$function$;

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
as $function$
declare
  normalized_phone text := public.normalize_egyptian_phone(target_phone);
  raw_code text := 'PH-' || encode(extensions.gen_random_bytes(24), 'hex');
  expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'Not authorized to manage this building';
  end if;
  if nullif(trim(target_name), '') is null then raise exception 'Resident name is required'; end if;
  if not exists (
    select 1 from public.apartments a
    where a.id = target_apartment_id and a.building_id = target_building_id
  ) then raise exception 'Apartment does not belong to this building'; end if;

  update public.building_phone_invites
     set revoked_at = now()
   where building_id = target_building_id
     and apartment_id = target_apartment_id
     and invited_phone = normalized_phone
     and accepted_at is null and revoked_at is null;

  insert into public.building_phone_invites(
    building_id, apartment_id, invited_phone, invited_name,
    invite_code_hash, invited_by, expires_at
  ) values (
    target_building_id, target_apartment_id, normalized_phone, trim(target_name),
    encode(extensions.digest(raw_code, 'sha256'), 'hex'), auth.uid(), now() + interval '48 hours'
  ) returning building_phone_invites.expires_at into expiry;

  return query select raw_code, expiry;
end;
$function$;

create or replace function public.accept_building_phone_invite(target_invite_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_id uuid := auth.uid();
  verified_phone text;
  invite_row public.building_phone_invites%rowtype;
  apartment_owner boolean;
  profile_row public.profiles%rowtype;
begin
  if current_id is null then raise exception 'Authentication required'; end if;

  select public.normalize_egyptian_phone(u.phone)
    into verified_phone
    from auth.users u
   where u.id = current_id and u.phone_confirmed_at is not null;

  if verified_phone is null then
    raise exception 'Verify your mobile number before accepting this invitation';
  end if;

  select * into invite_row
    from public.building_phone_invites i
   where i.invite_code_hash = encode(extensions.digest(trim(target_invite_code), 'sha256'), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   for update;

  if not found then raise exception 'Invitation is invalid, expired, revoked, or already used'; end if;
  if verified_phone <> invite_row.invited_phone then
    raise exception 'This invitation belongs to a different mobile number';
  end if;

  select * into profile_row from public.profiles p where p.id = current_id for update;
  if not found or profile_row.role <> 'pending' or profile_row.approved
     or profile_row.disabled_at is not null or profile_row.building_id is not null then
    raise exception 'This account is already assigned or is not eligible';
  end if;

  select a.is_owner into apartment_owner
    from public.apartments a
   where a.id = invite_row.apartment_id and a.building_id = invite_row.building_id;
  if not found then raise exception 'The invited apartment is no longer available'; end if;

  update public.profiles
     set role = case when coalesce(apartment_owner, false) then 'owner' else 'tenant' end,
         approved = true, building_id = invite_row.building_id,
         apartment_id = invite_row.apartment_id,
         phone = verified_phone,
         full_name = coalesce(nullif(trim(profile_row.full_name), ''), invite_row.invited_name),
         updated_at = now()
   where id = current_id;

  update public.building_phone_invites set accepted_at = now() where id = invite_row.id;
  return true;
end;
$function$;

revoke all on function public.normalize_egyptian_phone(text) from public, anon, authenticated;
revoke all on function public.create_building_phone_invite(uuid, uuid, text, text) from public, anon;
revoke all on function public.accept_building_phone_invite(text) from public, anon;
grant execute on function public.create_building_phone_invite(uuid, uuid, text, text) to authenticated;
grant execute on function public.accept_building_phone_invite(text) to authenticated;
