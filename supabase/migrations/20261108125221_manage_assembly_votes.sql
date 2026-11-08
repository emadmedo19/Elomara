create function public.manage_building_poll(p_poll_id uuid,p_remove boolean,p_question text,p_description text)
returns void language plpgsql security definer set search_path='' as $$
declare poll public.building_polls;
begin
  select * into poll from public.building_polls where id=p_poll_id for update;
  if auth.uid() is null or poll.id is null or not public.can_manage_bunyan_building(poll.building_id) then raise exception 'Forbidden'; end if;
  if p_remove then
    delete from public.building_polls where id=p_poll_id;
  else
    if poll.status='closed' or poll.ends_at<=now() or exists(select 1 from public.building_poll_participation where poll_id=p_poll_id) then raise exception 'Voting has started'; end if;
    if length(btrim(p_question)) not between 5 and 300 or p_question is null or length(coalesce(p_description,''))>5000 then raise exception 'Invalid decision'; end if;
    update public.building_polls set question=btrim(p_question),description=coalesce(p_description,'') where id=p_poll_id;
  end if;
end; $$;
revoke all on function public.manage_building_poll(uuid,boolean,text,text) from public,anon;
grant execute on function public.manage_building_poll(uuid,boolean,text,text) to authenticated;
