DO $$
DECLARE b uuid:=current_setting('test.repair_building')::uuid;
BEGIN
 IF (SELECT balance FROM public.buildings WHERE id=b)<>101 THEN RAISE EXCEPTION 'Correction debited a real receipt or was applied twice'; END IF;
 IF (SELECT sum(amount) FROM public.payments WHERE building_id=b AND NOT is_assessment)<>1 THEN RAISE EXCEPTION 'Real receipt changed'; END IF;
 IF (SELECT sum(amount) FROM public.payments WHERE building_id=b AND is_assessment)<>10 THEN RAISE EXCEPTION 'Original assessment not preserved'; END IF;
END $$;
