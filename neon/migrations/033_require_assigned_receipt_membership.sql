-- Definition only. NULL apartment/building assignments must fail closed.
-- Authorized receipt lookup: no public URLs or client-supplied invoice values.
CREATE OR REPLACE FUNCTION public.get_payment_receipt(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; pay public.payments; b public.buildings; charge public.payments;
BEGIN
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id();
 IF actor.id IS NULL OR actor.approved IS DISTINCT FROM true OR actor.disabled_at IS NOT NULL THEN RAISE EXCEPTION 'غير مصرح بعرض الإيصال' USING errcode='42501'; END IF;
 SELECT * INTO pay FROM public.payments WHERE id=p_payment_id;
 IF pay.id IS NULL OR pay.is_assessment OR pay.is_opening_entry THEN RAISE EXCEPTION 'الإيصال غير متاح أو تم حذف الدفعة'; END IF;
 IF ((actor.role='building_admin' AND public.can_manage_bunyan_building(pay.building_id)) OR (actor.role IN ('owner','tenant') AND actor.building_id=pay.building_id AND actor.apartment_id=pay.apartment_id)) IS DISTINCT FROM true THEN RAISE EXCEPTION 'الإيصال خاص بالشقة صاحبة السداد فقط' USING errcode='42501'; END IF;
 SELECT * INTO b FROM public.buildings WHERE id=pay.building_id;
 IF pay.exceptional_charge_id IS NOT NULL THEN SELECT * INTO charge FROM public.payments WHERE id=pay.exceptional_charge_id AND building_id=pay.building_id AND apartment_id=pay.apartment_id; END IF;
 RETURN jsonb_build_object('id',pay.id,'reference','PAY-'||upper(pay.id::text),'receiptNumber',coalesce(nullif(pay.receipt_number,''),'PAY-'||upper(pay.id::text)),
  'buildingId',b.id,'buildingName',b.name,'buildingAddress',b.address,'apartmentId',pay.apartment_id,'unitNumber',pay.unit_number,'residentName',coalesce(pay.resident_name,''),
  'amount',pay.amount,'paymentDate',pay.payment_date,'period',pay.month,'method',pay.method,'notes',coalesce(pay.notes,''),'paymentType',pay.payment_type,
  'description',CASE WHEN charge.id IS NOT NULL THEN coalesce(charge.notes,'تحصيل استثنائي') ELSE 'اشتراك الصيانة الشهري' END,'recordedAt',pay.recorded_at);
END $$;
