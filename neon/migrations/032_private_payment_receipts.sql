-- Authorized receipt lookup: no public URLs or client-supplied invoice values.
CREATE OR REPLACE FUNCTION public.get_payment_receipt(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; pay public.payments; b public.buildings; charge public.payments;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF actor.id IS NULL OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL THEN RAISE EXCEPTION 'غير مصرح بعرض الإيصال' USING errcode='42501'; END IF;
 SELECT * INTO pay FROM public.payments WHERE id=p_payment_id;
 IF pay.id IS NULL OR pay.is_assessment OR pay.is_opening_entry THEN RAISE EXCEPTION 'الإيصال غير متاح أو تم حذف الدفعة'; END IF;
 IF NOT ((actor.role='building_admin' AND public.can_manage_bunyan_building(pay.building_id)) OR (actor.role IN ('owner','tenant') AND actor.building_id=pay.building_id AND actor.apartment_id=pay.apartment_id)) THEN RAISE EXCEPTION 'الإيصال خاص بالشقة صاحبة السداد فقط' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=pay.building_id;
 IF pay.exceptional_charge_id IS NOT NULL THEN SELECT * INTO charge FROM public.payments WHERE id=pay.exceptional_charge_id AND building_id=pay.building_id AND apartment_id=pay.apartment_id; END IF;
 RETURN jsonb_build_object('id',pay.id,'reference','PAY-'||upper(pay.id::text),'receiptNumber',coalesce(nullif(pay.receipt_number,''),'PAY-'||upper(pay.id::text)),
  'buildingId',b.id,'buildingName',b.name,'buildingAddress',b.address,'apartmentId',pay.apartment_id,'unitNumber',pay.unit_number,'residentName',coalesce(pay.resident_name,''),
  'amount',pay.amount,'paymentDate',pay.payment_date,'period',pay.month,'method',pay.method,'notes',coalesce(pay.notes,''),'paymentType',pay.payment_type,
  'description',CASE WHEN charge.id IS NOT NULL THEN coalesce(charge.notes,'تحصيل استثنائي') ELSE 'اشتراك الصيانة الشهري' END,'recordedAt',pay.recorded_at);
END $$;
-- @statement
REVOKE ALL ON FUNCTION public.get_payment_receipt(uuid) FROM PUBLIC,anon;
-- @statement
GRANT EXECUTE ON FUNCTION public.get_payment_receipt(uuid) TO authenticated;

-- @statement
-- Reuse the existing transactional notification: no second notification stream.
CREATE OR REPLACE FUNCTION public.capture_app_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item jsonb;
  bld uuid;
  apt uuid;
  target_user uuid;
  audience text := 'managers';
  kind text;
  heading text;
  message text;
  manager_page text;
  member_page text := 'home';
  event_key text;
begin
  if TG_OP='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return null; end if;
  if TG_OP='DELETE' then item:=to_jsonb(old); else item:=to_jsonb(new); end if;
  if TG_TABLE_NAME='payments' and (coalesce((item->>'is_assessment')::boolean,false) OR coalesce((item->>'is_opening_entry')::boolean,false)) then return null; end if;
  bld := (item->>'building_id')::uuid;
  apt := (item->>'apartment_id')::uuid;
  if bld is null or not exists(select 1 from public.buildings where id=bld) then return null; end if;
  kind:=TG_TABLE_NAME;
  case TG_TABLE_NAME
    when 'announcements' then
      if item->>'archived_at' is not null then return null; end if;
      audience:='all'; heading:=case when TG_OP='UPDATE' then 'تحديث إعلان: ' else 'إعلان: ' end || (item->>'title');
      message:=left(coalesce(item->>'content','إعلان جديد من إدارة العمارة'),180);
      manager_page:='image-studio'; member_page:='announcements';
    when 'maintenance_tickets' then
      audience:='apartment'; heading:=case when TG_OP='INSERT' then 'بلاغ صيانة جديد' else 'تحديث بلاغ الصيانة' end;
      message:=coalesce(item->>'title','بلاغ صيانة') || ' • ' || coalesce(item->>'status','جديد');
      manager_page:='resident'; member_page:='maintenance';
    when 'apartments' then
      if item->>'payment_status' <> 'overdue' or (to_jsonb(old)->>'payment_status') is not distinct from item->>'payment_status' then return null; end if;
      apt:=(item->>'id')::uuid; audience:='apartment'; heading:='تنبيه مستحقات الشقة';
      message:='توجد مستحقات متأخرة على الشقة '||coalesce(item->>'unit_number',''); manager_page:='collections'; member_page:='payments';
    when 'facility_bookings' then
      audience:='apartment'; heading:=case when TG_OP='INSERT' then 'طلب حجز مرفق' else 'تحديث طلب الحجز' end;
      message:=coalesce(item->>'facility','حجز مرفق') || ' • ' || coalesce(item->>'status','قيد المراجعة');
      manager_page:='resident'; member_page:='bookings';
    when 'payments' then
      audience:='apartment'; heading:=case TG_OP when 'DELETE' then 'حذف دفعة مسجلة' when 'UPDATE' then 'تعديل دفعة مسجلة' else 'تسجيل سداد جديد' end;
      message:='تم تحديث سداد مسجل. افتح التطبيق لعرض تفاصيل الإيصال.';
      manager_page:='collections'; member_page:='payments';
    when 'expenses' then
      audience:='all';
      heading:=case TG_OP when 'DELETE' then 'حذف مصروف' when 'UPDATE' then 'تعديل مصروف' else 'مصروف جديد' end;
      message:=coalesce(item->>'title','مصروف') || ' • ' || coalesce(item->>'amount','0') || ' ج.م'; manager_page:='expenses';
    when 'building_join_requests' then
      target_user:=(item->>'user_id')::uuid; audience:='user';
      heading:=case when item->>'status'='pending' then 'طلب انضمام جديد' else 'تحديث طلب الانضمام' end;
      message:=coalesce(item->>'full_name','طلب انضمام') || ' • ' || case item->>'status' when 'approved' then 'تمت الموافقة' when 'rejected' then 'تم الرفض' else 'قيد المراجعة' end;
      manager_page:='approvals';
    when 'building_polls' then
      if TG_OP='INSERT' and (item->>'starts_at')::timestamptz > now() then return null; end if;
      audience:='all'; heading:=case when item->>'status'='closed' then 'انتهاء استطلاع رأي' else 'استطلاع رأي' end;
      message:=coalesce(item->>'question','استطلاع رأي العمارة'); manager_page:='polls'; member_page:='polls';
    when 'building_treasury_settings_audit' then
      heading:='تحديث الرصيد ووديعة الصيانة'; message:='تم حفظ تعديل إعدادات خزينة العمارة'; manager_page:='treasury-settings';
    when 'app_settings' then
      heading:='تحديث إعدادات العمارة'; message:='تم حفظ إعدادات العمارة والتحصيل'; manager_page:='app-settings';
    else return null;
  end case;
  if TG_OP='INSERT' then event_key:=TG_TABLE_NAME || ':' || coalesce(item->>'id',bld::text||':'||(item->>'setting_key')) || ':initial';
  else event_key:=TG_TABLE_NAME || ':' || coalesce(item->>'id',bld::text||':'||(item->>'setting_key')) || ':' || TG_OP || ':' || txid_current()::text || ':' || md5(item::text); end if;
  -- Building expenses reach all members; payments and maintenance stay apartment-scoped.
  insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,entity_id,source_key)
  select p.id,bld,kind,heading,message,manager_page,member_page,(item->>'id')::uuid,event_key
  from public.profiles p where p.building_id=bld and p.approved and p.disabled_at is null
    and (TG_TABLE_NAME<>'payments' or p.role='building_admin' or p.apartment_id=apt)
    and (p.role='building_admin' or (p.role in ('owner','tenant') and
      (audience='all' or (audience='apartment' and p.apartment_id=apt) or (audience='user' and p.id=target_user))))
  on conflict(recipient_id,source_key) do nothing;
  return null;
end;
$function$;



-- @statement
NOTIFY pgrst,'reload schema';
