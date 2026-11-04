-- Allow phone/password-created resident accounts to accept their phone-bound invite.
-- The phone is an account attribute, not a verified identity claim (no SMS verification is performed).
create or replace function public.accept_building_phone_invite(target_invite_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_id uuid := auth.uid();
  account_phone text;
  invite_row public.building_phone_invites%rowtype;
  apartment_owner boolean;
  profile_row public.profiles%rowtype;
begin
  if current_id is null then raise exception 'Authentication required'; end if;

  select public.normalize_egyptian_phone(p.phone)
    into account_phone
    from public.profiles p
   where p.id = current_id and nullif(trim(p.phone), '') is not null;

  if account_phone is null then
    raise exception 'Add a mobile number to your account before accepting this invitation';
  end if;

  select * into invite_row
    from public.building_phone_invites i
   where i.invite_code_hash = encode(extensions.digest(trim(target_invite_code), 'sha256'), 'hex')
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   for update;

  if not found then raise exception 'Invitation is invalid, expired, revoked, or already used'; end if;
  if account_phone <> invite_row.invited_phone then
    raise exception 'This invitation belongs to a different mobile number';
  end if;

  select * into profile_row from public.profiles p where p.id = current_id for update;
  if not found or profile_row.role <> 'pending' or profile_row.approved
     or profile_row.disabled_at is not null or profile_row.building_id is not null then
    raise exception 'This account is already assigned or is not eligible'; end if;

  select a.is_owner into apartment_owner
    from public.apartments a
   where a.id = invite_row.apartment_id and a.building_id = invite_row.building_id;
  if not found then raise exception 'The invited apartment is no longer available'; end if;

  update public.profiles
     set role = case when coalesce(apartment_owner, false) then 'owner' else 'tenant' end,
         approved = true, building_id = invite_row.building_id,
         apartment_id = invite_row.apartment_id,
         phone = account_phone,
         full_name = coalesce(nullif(trim(profile_row.full_name), ''), invite_row.invited_name),
         updated_at = now()
   where id = current_id;

  update public.building_phone_invites set accepted_at = now() where id = invite_row.id;
  return true;
end;
$function$;

revoke all on function public.accept_building_phone_invite(text) from public, anon;
grant execute on function public.accept_building_phone_invite(text) to authenticated;
