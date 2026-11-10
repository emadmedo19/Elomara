-- Defines role management only; does not change any member's existing role.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resident_role text CHECK(resident_role IN ('owner','tenant'));
CREATE OR REPLACE FUNCTION private.remember_resident_role() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.role IN ('owner','tenant') THEN NEW.resident_role:=NEW.role;
 ELSIF TG_OP='UPDATE' AND OLD.role IN ('owner','tenant') THEN NEW.resident_role:=OLD.role;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.remember_resident_role() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER remember_resident_role BEFORE INSERT OR UPDATE OF role ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION private.remember_resident_role();

CREATE OR REPLACE FUNCTION public.set_building_member_role(target_building_id uuid,target_user_id uuid,new_role text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.profiles; member public.profiles; restored_role text;
BEGIN
 IF app_auth.user_id() IS NULL OR new_role IS NULL OR new_role NOT IN ('resident','manager') THEN
  RAISE EXCEPTION 'اختار ساكن أو مدير' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.buildings WHERE id=target_building_id FOR UPDATE;
 SELECT * INTO actor FROM public.profiles WHERE id=app_auth.user_id() FOR UPDATE;
 IF actor.role IS DISTINCT FROM 'building_admin' OR NOT actor.approved OR actor.disabled_at IS NOT NULL
  OR actor.building_id IS DISTINCT FROM target_building_id THEN
  RAISE EXCEPTION 'غير مصرح بتغيير صلاحيات أعضاء هذه العمارة' USING ERRCODE='42501';
 END IF;
 SELECT * INTO member FROM public.profiles WHERE id=target_user_id FOR UPDATE;
 IF member.id IS NULL OR member.building_id IS DISTINCT FROM target_building_id OR NOT member.approved
  OR member.disabled_at IS NOT NULL OR member.role NOT IN ('owner','tenant','building_admin') THEN
  RAISE EXCEPTION 'العضو غير موجود أو غير متاح في هذه العمارة';
 END IF;
 IF new_role='manager' THEN
  UPDATE public.profiles SET role='building_admin',updated_at=now() WHERE id=member.id;
 ELSE
  IF member.role='building_admin' AND NOT EXISTS(SELECT 1 FROM public.profiles
    WHERE building_id=target_building_id AND id<>member.id AND role='building_admin' AND approved AND disabled_at IS NULL) THEN
   RAISE EXCEPTION 'لازم يفضل مدير واحد على الأقل للعمارة';
  END IF;
  SELECT coalesce(member.resident_role,
   CASE WHEN member.role IN ('owner','tenant') THEN member.role END,
   (SELECT r.resident_type FROM public.building_join_requests r WHERE r.user_id=member.id AND r.building_id=target_building_id AND r.status='approved' ORDER BY r.reviewed_at DESC NULLS LAST LIMIT 1),
   (SELECT CASE WHEN a.is_owner THEN 'owner' ELSE 'tenant' END FROM public.apartments a WHERE a.id=member.apartment_id AND a.building_id=target_building_id),'tenant') INTO restored_role;
  UPDATE public.profiles SET role=restored_role,updated_at=now() WHERE id=member.id;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_building_member_role(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_building_member_role(uuid,uuid,text) TO authenticated;
