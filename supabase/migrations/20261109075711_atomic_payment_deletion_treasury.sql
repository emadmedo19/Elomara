create function public.delete_payment_with_treasury(payment_id uuid) returns numeric language plpgsql security definer set search_path='' as $$
declare receipt public.payments; result numeric;
begin
 select * into receipt from public.payments where id=payment_id for update;
 if receipt.id is null then raise exception 'Payment not found'; end if;
 if auth.uid() is null or not public.can_manage_bunyan_building(receipt.building_id) then raise exception 'Forbidden'; end if;
 update public.buildings set balance=balance-receipt.amount where id=receipt.building_id returning balance into result;
 delete from public.payments where id=receipt.id;
 return result;
end $$;
revoke all on function public.delete_payment_with_treasury(uuid) from public,anon;
grant execute on function public.delete_payment_with_treasury(uuid) to authenticated;
