-- @statement
ALTER TABLE private.vip_codes
  ADD COLUMN IF NOT EXISTS display_code text,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- @statement
CREATE OR REPLACE FUNCTION public.platform_subscription_admin(p_action text, p_code_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_owner boolean; v_code text; v_hash text; v_id uuid; v_result jsonb;
BEGIN
 SELECT EXISTS(SELECT 1 FROM private.platform_owners o JOIN private.auth_identity_map m ON m.neon_user_id=o.neon_user_id WHERE m.app_user_id=app_auth.user_id()) INTO v_owner;
 IF app_auth.user_id() IS NULL OR NOT v_owner THEN RAISE EXCEPTION 'غير مصرح بإدارة الاشتراكات' USING ERRCODE='42501'; END IF;
 IF p_action='summary' THEN
   SELECT jsonb_build_object('buildings',(SELECT count(*) FROM public.buildings),'trial',(SELECT count(*) FROM public.building_subscriptions WHERE status='trial'),'active',(SELECT count(*) FROM public.building_subscriptions WHERE status='active'),'vip',(SELECT count(*) FROM public.building_subscriptions WHERE status='vip'),'codes_available',(SELECT count(*) FROM private.vip_codes WHERE redeemed_at IS NULL AND revoked_at IS NULL),'codes_used',(SELECT count(*) FROM private.vip_codes WHERE redeemed_at IS NOT NULL)) INTO v_result;
   RETURN v_result;
 ELSIF p_action='list' THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id', c.id,
     'code', CASE WHEN c.redeemed_at IS NULL THEN c.display_code END,
     'created_at', c.created_at,
     'status', CASE WHEN c.redeemed_at IS NOT NULL THEN 'used'
       WHEN c.paused THEN 'paused' WHEN c.revoked_at IS NOT NULL THEN 'revoked' ELSE 'available' END
   ) ORDER BY c.created_at DESC, c.id DESC), '[]'::jsonb)
   INTO v_result FROM private.vip_codes c WHERE c.deleted_at IS NULL;
   RETURN v_result;
 ELSIF p_action='generate' THEN
   v_code := 'ELM-VIP-' || upper(encode(public.gen_random_bytes(12),'hex'));
   v_hash := encode(public.digest(v_code,'sha256'),'hex');
   INSERT INTO private.vip_codes(code_hash, display_code) VALUES (v_hash, v_code) RETURNING id INTO v_id;
   INSERT INTO private.subscription_events(event_type,metadata) VALUES ('vip_code_created',jsonb_build_object('code_id',v_id,'actor',app_auth.user_id()));
   RETURN jsonb_build_object('id',v_id,'code',v_code);
 ELSIF p_action='revoke' THEN
   IF p_code_id IS NULL THEN RAISE EXCEPTION 'كود غير محدد'; END IF;
   UPDATE private.vip_codes SET revoked_at=now(), display_code=NULL WHERE id=p_code_id AND redeemed_at IS NULL AND revoked_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'الكود مستخدم أو ملغي أو غير موجود'; END IF;
   INSERT INTO private.subscription_events(event_type,metadata) VALUES ('vip_code_revoked',jsonb_build_object('code_id',p_code_id,'actor',app_auth.user_id()));
   RETURN jsonb_build_object('ok',true);
 ELSIF p_action IN ('pause', 'resume', 'delete') THEN
   IF p_code_id IS NULL THEN RAISE EXCEPTION 'كود غير محدد'; END IF;
   UPDATE private.vip_codes
   SET revoked_at = CASE WHEN p_action = 'resume' THEN NULL ELSE coalesce(revoked_at, now()) END,
       paused = p_action = 'pause',
       deleted_at = CASE WHEN p_action = 'delete' THEN now() END,
       display_code = CASE WHEN p_action = 'delete' THEN NULL ELSE display_code END
   WHERE id = p_code_id AND redeemed_at IS NULL AND deleted_at IS NULL
     AND (p_action = 'delete' OR (p_action = 'pause' AND revoked_at IS NULL)
       OR (p_action = 'resume' AND paused));
   IF NOT FOUND THEN RAISE EXCEPTION 'حالة الكود تغيّرت أو الكود مستخدم'; END IF;
   INSERT INTO private.subscription_events(event_type, metadata)
   VALUES ('vip_code_' || CASE p_action WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'resumed' ELSE 'deleted' END,
     jsonb_build_object('code_id', p_code_id, 'actor', app_auth.user_id()));
   RETURN jsonb_build_object('ok', true);
 END IF;
 RAISE EXCEPTION 'عملية غير معروفة';
END $function$;
-- @statement
CREATE OR REPLACE FUNCTION public.redeem_building_vip(p_building_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor public.profiles; v_code_id uuid; v_hash text;
BEGIN
 IF app_auth.user_id() IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_actor FROM public.profiles WHERE id=app_auth.user_id();
 IF NOT FOUND OR v_actor.role IS DISTINCT FROM 'building_admin' OR v_actor.approved IS DISTINCT FROM true OR v_actor.disabled_at IS NOT NULL OR v_actor.building_id IS DISTINCT FROM p_building_id THEN
 RAISE EXCEPTION 'غير مصرح لك بتفعيل اشتراك هذه العمارة' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.buildings WHERE id=p_building_id) THEN RAISE EXCEPTION 'العمارة غير موجودة'; END IF;
 IF p_code IS NULL OR length(trim(p_code)) NOT BETWEEN 12 AND 100 THEN RAISE EXCEPTION 'كود غير صحيح'; END IF;
 v_hash:=encode(public.digest(upper(trim(p_code)),'sha256'),'hex');
 SELECT id INTO v_code_id FROM private.vip_codes WHERE code_hash=v_hash AND redeemed_at IS NULL AND revoked_at IS NULL FOR UPDATE;
 IF v_code_id IS NULL THEN RAISE EXCEPTION 'الكود غير صحيح أو تم استخدامه من قبل'; END IF;
 IF EXISTS(SELECT 1 FROM public.building_subscriptions WHERE building_id=p_building_id AND status='vip') THEN RAISE EXCEPTION 'العمارة لديها اشتراك VIP بالفعل'; END IF;
 INSERT INTO public.building_subscriptions(building_id,status,vip_granted_at,updated_at) VALUES(p_building_id,'vip',now(),now())
 ON CONFLICT(building_id) DO UPDATE SET status='vip',vip_granted_at=now(),updated_at=now();
 UPDATE private.vip_codes SET redeemed_at=now(),redeemed_building_id=p_building_id,display_code=NULL WHERE id=v_code_id;
 INSERT INTO private.subscription_events(building_id,event_type,metadata) VALUES(p_building_id,'vip_redeemed',jsonb_build_object('code_id',v_code_id,'actor',app_auth.user_id()));
 RETURN jsonb_build_object('ok',true,'status','vip');
END $function$;
