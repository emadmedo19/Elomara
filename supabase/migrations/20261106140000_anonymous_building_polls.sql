-- Anonymous building polls.
-- Voter identity is stored separately from the anonymous ballot. There is no
-- user_id, timestamp, or foreign key connecting a ballot to a participant.

create table public.building_polls (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  question text not null check (char_length(btrim(question)) between 5 and 300),
  description text not null default '',
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  show_results_before_close boolean not null default false,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint building_polls_valid_period check (ends_at > starts_at)
);

create index building_polls_building_created_idx
  on public.building_polls (building_id, created_at desc);

create table public.building_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.building_polls(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  sort_order integer not null default 0,
  unique (poll_id, label)
);

create index building_poll_options_poll_idx
  on public.building_poll_options (poll_id, sort_order);

-- This table records only that an account participated. It contains no choice.
create table public.building_poll_participation (
  poll_id uuid not null references public.building_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (poll_id, user_id)
);

-- Anonymous ballots contain no voter identifier and no timestamp.
create table public.building_poll_ballots (
  poll_id uuid not null references public.building_polls(id) on delete cascade,
  option_id uuid not null references public.building_poll_options(id) on delete cascade
);

create index building_poll_ballots_poll_option_idx
  on public.building_poll_ballots (poll_id, option_id);

alter table public.building_polls enable row level security;
alter table public.building_poll_options enable row level security;
alter table public.building_poll_participation enable row level security;
alter table public.building_poll_ballots enable row level security;

create policy building_polls_select_same_building
on public.building_polls for select to authenticated
using (
  public.can_manage_bunyan_building(building_id)
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.building_id = building_polls.building_id
      and p.approved = true
      and p.disabled_at is null
      and p.role in ('owner', 'tenant')
      and p.apartment_id is not null
  )
);

create policy building_poll_options_select_same_building
on public.building_poll_options for select to authenticated
using (
  exists (
    select 1 from public.building_polls p
    where p.id = building_poll_options.poll_id
      and (
        public.can_manage_bunyan_building(p.building_id)
        or exists (
          select 1 from public.profiles resident
          where resident.id = (select auth.uid())
            and resident.building_id = p.building_id
            and resident.approved = true
            and resident.disabled_at is null
            and resident.role in ('owner', 'tenant')
            and resident.apartment_id is not null
        )
      )
  )
);

-- Participation and ballot tables intentionally have no client-facing policies.
revoke all on public.building_poll_participation from anon, authenticated;
revoke all on public.building_poll_ballots from anon, authenticated;
grant select on public.building_polls, public.building_poll_options to authenticated;

create or replace function public.create_building_poll(
  p_building_id uuid,
  p_question text,
  p_description text,
  p_options jsonb,
  p_ends_at timestamptz,
  p_show_results_before_close boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll_id uuid;
  v_option text;
  v_order integer := 0;
begin
  if auth.uid() is null or not public.can_manage_bunyan_building(p_building_id) then
    raise exception 'Building manager access required' using errcode = '42501';
  end if;

  if p_question is null or char_length(btrim(p_question)) not between 5 and 300 then
    raise exception 'Question must be between 5 and 300 characters';
  end if;

  if p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '30 days' then
    raise exception 'Poll duration must be in the next 30 days';
  end if;

  if p_options is null or jsonb_typeof(p_options) <> 'array'
     or jsonb_array_length(p_options) not between 2 and 8 then
    raise exception 'A poll must have between 2 and 8 options';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_options) as item(value)
    group by lower(btrim(value))
    having count(*) > 1
  ) then
    raise exception 'Poll options must be unique';
  end if;

  insert into public.building_polls (
    building_id, created_by, question, description, ends_at, show_results_before_close
  ) values (
    p_building_id, auth.uid(), btrim(p_question), coalesce(btrim(p_description), ''),
    p_ends_at, coalesce(p_show_results_before_close, false)
  ) returning id into v_poll_id;

  for v_option in select btrim(value) from jsonb_array_elements_text(p_options) as item(value)
  loop
    if char_length(v_option) not between 1 and 120 then
      raise exception 'Each option must be between 1 and 120 characters';
    end if;
    insert into public.building_poll_options (poll_id, label, sort_order)
    values (v_poll_id, v_option, v_order);
    v_order := v_order + 1;
  end loop;

  return v_poll_id;
end;
$$;

create or replace function public.close_building_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.building_polls
     set status = 'closed', closed_at = coalesce(closed_at, now())
   where id = p_poll_id
     and public.can_manage_bunyan_building(building_id);

  if not found then
    raise exception 'Poll not found or access denied' using errcode = '42501';
  end if;
  return true;
end;
$$;

create or replace function public.cast_building_poll_vote(
  p_poll_id uuid,
  p_option_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_poll record;
  v_inserted_poll_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select role, approved, building_id, apartment_id, disabled_at
    into v_profile
    from public.profiles
   where id = auth.uid();

  if not found or v_profile.approved is distinct from true
     or v_profile.disabled_at is not null
     or v_profile.role not in ('owner', 'tenant')
     or v_profile.apartment_id is null then
    raise exception 'Approved resident account required' using errcode = '42501';
  end if;

  select id, building_id, starts_at, ends_at, status
    into v_poll
    from public.building_polls
   where id = p_poll_id
     and building_id = v_profile.building_id;

  if not found or v_poll.status <> 'active'
     or v_poll.starts_at > now() or v_poll.ends_at <= now() then
    raise exception 'Poll is not open for voting';
  end if;

  if not exists (
    select 1 from public.building_poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'Invalid poll option';
  end if;

  -- The unique participation row enforces one vote per account. It is inserted
  -- in the same transaction as the anonymous ballot, so failures roll back both.
  insert into public.building_poll_participation (poll_id, user_id)
  values (p_poll_id, auth.uid())
  on conflict do nothing
  returning poll_id into v_inserted_poll_id;

  if v_inserted_poll_id is null then
    raise exception 'You have already voted in this poll';
  end if;

  insert into public.building_poll_ballots (poll_id, option_id)
  values (p_poll_id, p_option_id);

  return true;
end;
$$;

create or replace function public.get_building_poll_results(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_poll record;
  v_is_manager boolean := false;
  v_has_voted boolean := false;
  v_is_closed boolean := false;
  v_results_visible boolean := false;
  v_participants integer := 0;
  v_targeted integer := 0;
  v_options jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_poll
    from public.building_polls
   where id = p_poll_id;

  if not found then
    raise exception 'Poll not found' using errcode = 'P0002';
  end if;

  select role, approved, building_id, apartment_id, disabled_at
    into v_profile
    from public.profiles
   where id = auth.uid();

  if not found or v_profile.approved is distinct from true
     or v_profile.disabled_at is not null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  v_is_manager := public.can_manage_bunyan_building(v_poll.building_id);

  if not v_is_manager and (
    v_profile.role not in ('owner', 'tenant')
    or v_profile.apartment_id is null
    or v_profile.building_id is distinct from v_poll.building_id
  ) then
    raise exception 'Building access denied' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.building_poll_participation
    where poll_id = p_poll_id and user_id = auth.uid()
  ) into v_has_voted;

  v_is_closed := v_poll.status = 'closed' or v_poll.ends_at <= now();

  select count(*)::integer into v_participants
    from public.building_poll_participation
   where poll_id = p_poll_id;

  select count(*)::integer into v_targeted
    from public.profiles p
   where p.building_id = v_poll.building_id
     and p.approved = true
     and p.disabled_at is null
     and p.role in ('owner', 'tenant')
     and p.apartment_id is not null;

  v_results_visible := v_is_manager or v_poll.show_results_before_close or v_has_voted or v_is_closed;

  if v_results_visible then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', option_rows.id,
          'label', option_rows.label,
          'votes', option_rows.votes,
          'percentage', case
            when v_participants > 0 then round(option_rows.votes * 100.0 / v_participants, 1)
            else 0
          end
        ) order by option_rows.sort_order
      ),
      '[]'::jsonb
    )
    into v_options
    from (
      select o.id, o.label, o.sort_order, count(b.option_id)::integer as votes
        from public.building_poll_options o
        left join public.building_poll_ballots b
          on b.poll_id = p_poll_id and b.option_id = o.id
       where o.poll_id = p_poll_id
       group by o.id, o.label, o.sort_order
    ) option_rows;
  else
    v_options := null;
  end if;

  return jsonb_build_object(
    'poll_id', p_poll_id,
    'has_voted', v_has_voted,
    'is_closed', v_is_closed,
    'results_visible', v_results_visible,
    'participants_count', v_participants,
    'targeted_count', v_targeted,
    'non_participants_count', greatest(v_targeted - v_participants, 0),
    'turnout_percentage', case
      when v_targeted > 0 then round(v_participants * 100.0 / v_targeted, 1)
      else 0
    end,
    'options', v_options
  );
end;
$$;

revoke all on function public.create_building_poll(uuid, text, text, jsonb, timestamptz, boolean) from public, anon;
revoke all on function public.close_building_poll(uuid) from public, anon;
revoke all on function public.cast_building_poll_vote(uuid, uuid) from public, anon;
revoke all on function public.get_building_poll_results(uuid) from public, anon;
grant execute on function public.create_building_poll(uuid, text, text, jsonb, timestamptz, boolean) to authenticated;
grant execute on function public.close_building_poll(uuid) to authenticated;
grant execute on function public.cast_building_poll_vote(uuid, uuid) to authenticated;
grant execute on function public.get_building_poll_results(uuid) to authenticated;
