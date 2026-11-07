-- Family members share one apartment; display labels never grant permissions.
alter table public.profiles add column resident_label text not null default '' check(length(resident_label)<=60);
alter table public.building_join_requests add column requested_label text not null default '' check(length(requested_label)<=60);
drop index if exists public.profiles_one_active_resident_per_apartment;

create or replace function public.submit_building_join_request(target_code text,applicant_full_name text,applicant_floor integer,applicant_unit_number text,applicant_resident_type text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  actor uuid:=auth.uid(); bld uuid; request_id uuid; p public.profiles%rowtype;
  label text:=case applicant_resident_type when 'owner' then 'مالك' when 'tenant' then 'مستأجر' else btrim(applicant_resident_type) end;
  resident_role text;
begin
  if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if nullif(btrim(applicant_full_name),'') is null or length(btrim(applicant_full_name))<3 then raise exception 'اكتب الاسم بالكامل'; end if;
  if applicant_floor is null or applicant_floor<0 or nullif(btrim(applicant_unit_number),'') is null then raise exception 'راجع بيانات الدور ورقم الشقة'; end if;
  if label is null or length(label)<1 or length(label)>60 then raise exception 'اكتب الصفة في حدود 60 حرفًا'; end if;
  resident_role:=case when label='مالك' then 'owner' else 'tenant' end;
  select c.building_id into bld from public.building_access_codes c where upper(c.code)=upper(btrim(target_code)) and c.revoked_at is null;
  if bld is null then raise exception 'كود العمارة غير صحيح أو تم إلغاؤه'; end if;
  select * into p from public.profiles where id=actor for update;
  if not found or p.disabled_at is not null or p.approved or p.role<>'pending' or p.building_id is not null then raise exception 'الحساب غير مؤهل لإرسال طلب انضمام'; end if;
  if exists(select 1 from public.building_join_requests where user_id=actor and status='pending') then raise exception 'لديك طلب انضمام قيد المراجعة بالفعل'; end if;
  insert into public.building_join_requests(user_id,building_id,full_name,requested_floor,requested_unit_number,resident_type,requested_label)
  values(actor,bld,btrim(applicant_full_name),applicant_floor,btrim(applicant_unit_number),resident_role,label) returning id into request_id;
  update public.profiles set full_name=btrim(applicant_full_name),updated_at=now() where id=actor;
  return request_id;
end;
$$;

create or replace function public.approve_building_join_request_with_label(target_request_id uuid,target_apartment_id uuid,member_label text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
  request_row public.building_join_requests%rowtype; apt public.apartments%rowtype; applicant public.profiles%rowtype;
  label text:=btrim(member_label);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into request_row from public.building_join_requests where id=target_request_id;
  if not found or not public.can_manage_bunyan_building(request_row.building_id) then raise exception 'طلب الانضمام غير موجود أو غير مصرح به' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.uid() and role='building_admin' and approved and disabled_at is null and building_id=request_row.building_id for update;
  if not found then raise exception 'غير مصرح بإدارة هذه العمارة' using errcode='42501'; end if;
  select * into request_row from public.building_join_requests where id=target_request_id for update;
  if request_row.status<>'pending' then raise exception 'تمت مراجعة هذا الطلب بالفعل'; end if;
  if label is null or length(label)<1 or length(label)>60 then raise exception 'اكتب الصفة في حدود 60 حرفًا'; end if;
  select * into applicant from public.profiles where id=request_row.user_id for update;
  if not found or applicant.role<>'pending' or applicant.approved or applicant.building_id is not null or applicant.disabled_at is not null then raise exception 'حساب الساكن لم يعد في حالة انتظار'; end if;
  select * into apt from public.apartments where id=target_apartment_id and building_id=request_row.building_id for update;
  if not found then raise exception 'الشقة المختارة لا تتبع هذه العمارة'; end if;
  update public.profiles set full_name=request_row.full_name,role=request_row.resident_type,approved=true,
    building_id=request_row.building_id,apartment_id=target_apartment_id,resident_label=label,updated_at=now() where id=applicant.id;
  -- An additional family account never overwrites the apartment's primary name.
  -- Populate only an empty primary record, for an explicit owner/tenant label.
  if nullif(btrim(apt.resident_name),'') is null and label in ('مالك','مستأجر') and not exists(
    select 1 from public.profiles p where p.apartment_id=apt.id and p.approved and p.disabled_at is null and p.role in ('owner','tenant') and p.id<>applicant.id
  ) then
    update public.apartments set resident_name=request_row.full_name,is_owner=(label='مالك'),updated_at=now() where id=apt.id;
  end if;
  update public.building_join_requests set status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=target_request_id;
  return true;
end;
$$;

-- Preserve the old two-argument RPC for installed bundles.
create or replace function public.approve_building_join_request(target_request_id uuid,target_apartment_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare label text;
begin
  select coalesce(nullif(requested_label,''),case resident_type when 'owner' then 'مالك' else 'مستأجر' end) into label
  from public.building_join_requests where id=target_request_id;
  return public.approve_building_join_request_with_label(target_request_id,target_apartment_id,label);
end;
$$;

create or replace function public.remove_building_member(target_building_id uuid,target_user_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare member public.profiles%rowtype;
begin
  perform 1 from public.profiles where id=auth.uid() and role='building_admin' and approved and disabled_at is null and building_id=target_building_id for update;
  if not found then raise exception 'غير مصرح بحذف أعضاء هذه العمارة' using errcode='42501'; end if;
  select * into member from public.profiles where id=target_user_id and building_id=target_building_id and approved and role in ('owner','tenant') for update;
  if not found then raise exception 'العضو غير موجود أو سبق حذفه'; end if;
  -- Keep Auth identity, historical approvals, apartment and financial records.
  -- Clearing membership immediately revokes all profile-based building access.
  update public.profiles set role='pending',approved=false,building_id=null,apartment_id=null,resident_label='',updated_at=now() where id=member.id;
  delete from public.push_devices where user_id=member.id;
  return true;
end;
$$;

create or replace function public.set_building_member_label(target_building_id uuid,target_user_id uuid,member_label text)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
  perform 1 from public.profiles where id=auth.uid() and role='building_admin' and approved and disabled_at is null and building_id=target_building_id for update;
  if not found then raise exception 'غير مصرح بإدارة أعضاء هذه العمارة' using errcode='42501'; end if;
  if member_label is null or length(btrim(member_label))<1 or length(btrim(member_label))>60 then raise exception 'اكتب الصفة في حدود 60 حرفًا'; end if;
  update public.profiles set resident_label=btrim(member_label),updated_at=now() where id=target_user_id and building_id=target_building_id and approved and disabled_at is null and role in ('owner','tenant');
  if not found then raise exception 'العضو غير موجود أو غير متاح'; end if;
  return true;
end;
$$;
revoke all on function public.submit_building_join_request(text,text,integer,text,text) from public,anon;
revoke all on function public.approve_building_join_request(uuid,uuid) from public,anon;
revoke all on function public.approve_building_join_request_with_label(uuid,uuid,text) from public,anon;
revoke all on function public.remove_building_member(uuid,uuid) from public,anon;
revoke all on function public.set_building_member_label(uuid,uuid,text) from public,anon;
grant execute on function public.submit_building_join_request(text,text,integer,text,text) to authenticated;
grant execute on function public.approve_building_join_request(uuid,uuid) to authenticated;
grant execute on function public.approve_building_join_request_with_label(uuid,uuid,text) to authenticated;
grant execute on function public.remove_building_member(uuid,uuid) to authenticated;
grant execute on function public.set_building_member_label(uuid,uuid,text) to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end; $$;
