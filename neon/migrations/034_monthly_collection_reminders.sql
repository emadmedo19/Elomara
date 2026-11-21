-- @statement
CREATE OR REPLACE FUNCTION private.collection_reminder_phase(p_preferences jsonb, p_today date)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN extract(day FROM p_today) = due_day - 1 AND p_preferences->'before' = 'true'::jsonb THEN 'before'
    WHEN extract(day FROM p_today) > due_day AND p_preferences->'after' = 'true'::jsonb THEN 'after'
  END
  FROM (
    SELECT CASE WHEN p_preferences->>'day' ~ '^([2-9]|1[0-9]|2[0-8])$'
      THEN (p_preferences->>'day')::integer END AS due_day
  ) bounds;
$$;
-- @statement
REVOKE ALL ON FUNCTION private.collection_reminder_phase(jsonb,date) FROM PUBLIC,anon,authenticated;
-- @statement
CREATE OR REPLACE FUNCTION public.schedule_collection_reminders()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  WITH clock AS (
    SELECT timezone('Africa/Cairo', now())::date AS today
  ), eligible AS MATERIALIZED (
    SELECT b.id, to_char(clock.today,'YYYY-MM') AS period,
      private.collection_reminder_phase(s.setting_value,clock.today) AS phase
    FROM public.app_settings s
    JOIN public.buildings b ON b.id=s.building_id
    CROSS JOIN clock
    WHERE s.setting_key='collection_reminders'
      AND b.collection_start_month <= clock.today
      AND private.collection_reminder_phase(s.setting_value,clock.today) IS NOT NULL
  ), inserted AS (
    INSERT INTO public.app_notifications (
      recipient_id,building_id,category,title,body,manager_target,member_target,entity_id,source_key
    )
    SELECT p.id,b.id,'collection_reminders',
      CASE b.phase WHEN 'before' THEN 'تذكير بموعد الاشتراك' ELSE 'تذكير بتأخر الاشتراك' END,
      'راجع حساب شقتك المالي داخل التطبيق لمعرفة المتبقي.',
      'collections','payments',t.apartment_id,
      concat('collection:',b.id,':',t.apartment_id,':',b.period,':',b.phase)
    FROM eligible b
    CROSS JOIN LATERAL private.apartment_ledger_totals(b.id) t
    JOIN public.profiles p ON p.building_id=b.id AND p.apartment_id=t.apartment_id
    WHERE t.monthly_due > t.monthly_paid AND p.approved AND p.disabled_at IS NULL
      AND p.role IN ('owner','tenant')
    ON CONFLICT (recipient_id,source_key) DO NOTHING
    RETURNING id,recipient_id
  ), queued AS (
    INSERT INTO public.notification_deliveries(notification_id,device_id)
    SELECT n.id,d.id FROM inserted n JOIN public.push_devices d ON d.user_id=n.recipient_id
    ON CONFLICT DO NOTHING
  )
  SELECT count(*)::integer FROM inserted;
$$;
-- @statement
REVOKE ALL ON FUNCTION public.schedule_collection_reminders() FROM PUBLIC,anon,authenticated;
-- @statement
GRANT EXECUTE ON FUNCTION public.schedule_collection_reminders() TO service_role;
-- @statement
CREATE OR REPLACE FUNCTION public.current_collection_reminders(p_notification_ids uuid[])
RETURNS TABLE(notification_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH clock AS (SELECT timezone('Africa/Cairo', now())::date AS today),
  candidates AS MATERIALIZED (
    SELECT n.id,n.building_id,n.entity_id
    FROM public.app_notifications n
    JOIN public.profiles p ON p.id=n.recipient_id AND p.building_id=n.building_id AND p.apartment_id=n.entity_id
    JOIN public.app_settings s ON s.building_id=n.building_id AND s.setting_key='collection_reminders'
    JOIN public.buildings b ON b.id=n.building_id
    CROSS JOIN clock
    WHERE n.id=ANY(p_notification_ids) AND n.category='collection_reminders'
      AND p.approved AND p.disabled_at IS NULL AND p.role IN ('owner','tenant')
      AND b.collection_start_month <= clock.today
      AND private.collection_reminder_phase(s.setting_value,clock.today) IS NOT NULL
      AND n.source_key=concat('collection:',n.building_id,':',n.entity_id,':',to_char(clock.today,'YYYY-MM'),':',
        private.collection_reminder_phase(s.setting_value,clock.today))
  ), outstanding AS (
    SELECT b.building_id,t.apartment_id
    FROM (SELECT DISTINCT building_id FROM candidates) b
    CROSS JOIN LATERAL private.apartment_ledger_totals(b.building_id) t
    WHERE t.monthly_due > t.monthly_paid
  )
  SELECT c.id FROM candidates c JOIN outstanding t ON t.building_id=c.building_id AND t.apartment_id=c.entity_id;
$$;
-- @statement
REVOKE ALL ON FUNCTION public.current_collection_reminders(uuid[]) FROM PUBLIC,anon,authenticated;
-- @statement
GRANT EXECUTE ON FUNCTION public.current_collection_reminders(uuid[]) TO service_role;
-- @statement
DROP POLICY IF EXISTS collection_reminders_assigned_apartment ON public.app_notifications;
-- @statement
CREATE POLICY collection_reminders_assigned_apartment ON public.app_notifications
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  category <> 'collection_reminders' OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=app_auth.user_id()
      AND p.apartment_id=app_notifications.entity_id AND p.role IN ('owner','tenant')
  )
)
WITH CHECK (
  category <> 'collection_reminders' OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=app_auth.user_id()
      AND p.apartment_id=app_notifications.entity_id AND p.role IN ('owner','tenant')
  )
);
