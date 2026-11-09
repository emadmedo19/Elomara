-- Live Supabase application schema captured for the requested Neon migration.
-- No application rows, credentials, OAuth tokens, or signing material are stored here.
-- Run once on an EMPTY application schema, in a transaction by import-supabase.mjs.
SET check_function_bodies = false;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, phone text,
 phone_confirmed_at timestamptz, banned_until timestamptz,
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
REVOKE ALL ON auth.users FROM PUBLIC, authenticated, anon;
CREATE TABLE private.auth_identity_map (neon_user_id text PRIMARY KEY, app_user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
CREATE FUNCTION auth.app_user_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.app_user_id FROM private.auth_identity_map m JOIN auth.users u ON u.id=m.app_user_id
 WHERE m.neon_user_id=auth.user_id() AND (u.banned_until IS NULL OR u.banned_until<now())
$$;
REVOKE ALL ON FUNCTION auth.app_user_id() FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.app_user_id() TO authenticated;

CREATE TABLE public."building_poll_participation" (
 "poll_id" uuid NOT NULL,
 "user_id" uuid NOT NULL
);

CREATE TABLE public."building_poll_ballots" (
 "poll_id" uuid NOT NULL,
 "option_id" uuid NOT NULL
);

CREATE TABLE public."building_polls" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid NOT NULL,
 "created_by" uuid,
 "question" text NOT NULL,
 "description" text DEFAULT ''::text NOT NULL,
 "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
 "ends_at" timestamp with time zone NOT NULL,
 "status" text DEFAULT 'active'::text NOT NULL,
 "show_results_before_close" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "closed_at" timestamp with time zone
);

CREATE TABLE public."building_poll_options" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "poll_id" uuid NOT NULL,
 "label" text NOT NULL,
 "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public."building_treasury_settings_audit" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid NOT NULL,
 "previous_opening_balance" numeric(14,2),
 "opening_balance" numeric(14,2) NOT NULL,
 "previous_reserve_fund" numeric(14,2) NOT NULL,
 "reserve_fund" numeric(14,2) NOT NULL,
 "previous_balance" numeric(14,2) NOT NULL,
 "balance" numeric(14,2) NOT NULL,
 "opening_already_included" boolean NOT NULL,
 "changed_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."notification_deliveries" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "notification_id" uuid NOT NULL,
 "device_id" uuid NOT NULL,
 "attempts" integer DEFAULT 0 NOT NULL,
 "available_at" timestamp with time zone DEFAULT now() NOT NULL,
 "lease_id" uuid,
 "completed_at" timestamp with time zone,
 "outcome" text
);

CREATE TABLE public."app_release_notices" (
 "release_id" text NOT NULL,
 "title" text NOT NULL,
 "body" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."app_notifications" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "recipient_id" uuid NOT NULL,
 "building_id" uuid NOT NULL,
 "category" text NOT NULL,
 "title" text NOT NULL,
 "body" text DEFAULT ''::text NOT NULL,
 "manager_target" text NOT NULL,
 "member_target" text NOT NULL,
 "entity_id" uuid,
 "source_key" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "read_at" timestamp with time zone
);

CREATE TABLE public."building_invites" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid NOT NULL,
 "apartment_id" uuid NOT NULL,
 "invited_email" text,
 "invite_code" uuid DEFAULT gen_random_uuid() NOT NULL,
 "invited_by" uuid NOT NULL,
 "expires_at" timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
 "accepted_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "invited_phone" text,
 "invited_name" text
);

CREATE TABLE public."payments" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "apartment_id" uuid NOT NULL,
 "building_id" uuid NOT NULL,
 "unit_number" text NOT NULL,
 "resident_name" text DEFAULT ''::text NOT NULL,
 "amount" numeric(14,2) NOT NULL,
 "payment_date" date DEFAULT CURRENT_DATE NOT NULL,
 "month" text NOT NULL,
 "method" text DEFAULT 'نقدي'::text NOT NULL,
 "notes" text,
 "receipt_number" text,
 "idempotency_key" text,
 "recorded_by" uuid,
 "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
 "legacy_id" text,
 "payment_type" text DEFAULT 'monthly'::text NOT NULL
);

CREATE TABLE public."profiles" (
 "id" uuid NOT NULL,
 "full_name" text DEFAULT ''::text NOT NULL,
 "phone" text,
 "role" text DEFAULT 'pending'::text NOT NULL,
 "building_id" uuid,
 "apartment_id" uuid,
 "approved" boolean DEFAULT false NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "disabled_at" timestamp with time zone,
 "resident_label" text DEFAULT ''::text NOT NULL
);

CREATE TABLE public."apartments" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid NOT NULL,
 "unit_number" text NOT NULL,
 "floor" integer DEFAULT 0 NOT NULL,
 "resident_name" text DEFAULT ''::text NOT NULL,
 "resident_phone" text DEFAULT ''::text NOT NULL,
 "is_owner" boolean DEFAULT false NOT NULL,
 "monthly_fee" numeric(14,2) DEFAULT 0 NOT NULL,
 "payment_status" text DEFAULT 'pending'::text NOT NULL,
 "overdue_months" integer DEFAULT 0 NOT NULL,
 "last_payment_date" date,
 "paid_amount" numeric(14,2) DEFAULT 0 NOT NULL,
 "credit_balance" numeric(14,2) DEFAULT 0 NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."maintenance_tickets" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid,
 "apartment_id" uuid,
 "unit_number" text DEFAULT ''::text NOT NULL,
 "resident_name" text DEFAULT ''::text NOT NULL,
 "category" text DEFAULT 'أخرى'::text NOT NULL,
 "title" text NOT NULL,
 "description" text DEFAULT ''::text NOT NULL,
 "urgency" text DEFAULT 'عادي'::text NOT NULL,
 "status" text DEFAULT 'جديد'::text NOT NULL,
 "created_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."facility_bookings" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid,
 "apartment_id" uuid,
 "facility" text NOT NULL,
 "unit_number" text DEFAULT ''::text NOT NULL,
 "resident_name" text DEFAULT ''::text NOT NULL,
 "booking_date" date NOT NULL,
 "time_slot" text NOT NULL,
 "status" text DEFAULT 'قيد المراجعة'::text NOT NULL,
 "created_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."payment_audit_logs" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "action" text NOT NULL,
 "payment_id" uuid,
 "apartment_id" uuid,
 "unit_number" text,
 "building_id" uuid,
 "performed_by" uuid,
 "previous_data" jsonb,
 "new_data" jsonb,
 "notes" text,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."engagement_messages" (
 "id" text NOT NULL,
 "title" text NOT NULL,
 "body" text NOT NULL
);

CREATE TABLE public."engagement_history" (
 "user_id" uuid NOT NULL,
 "message_id" text NOT NULL,
 "day" date NOT NULL,
 "slot" integer NOT NULL
);

CREATE TABLE public."push_devices" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "token" text NOT NULL,
 "platform" text DEFAULT 'android'::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."buildings" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "name" text NOT NULL,
 "address" text DEFAULT ''::text NOT NULL,
 "total_units" integer DEFAULT 0 NOT NULL,
 "total_floors" integer,
 "balance" numeric(14,2) DEFAULT 0 NOT NULL,
 "monthly_target" numeric(14,2) DEFAULT 0 NOT NULL,
 "reserve_fund" numeric(14,2) DEFAULT 0 NOT NULL,
 "manager_name" text DEFAULT ''::text NOT NULL,
 "manager_phone" text DEFAULT ''::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "manager2_name" text DEFAULT ''::text NOT NULL,
 "manager2_phone" text DEFAULT ''::text NOT NULL,
 "manager3_name" text DEFAULT ''::text NOT NULL,
 "manager3_phone" text DEFAULT ''::text NOT NULL,
 "opening_balance" numeric(14,2),
 "latitude" double precision,
 "longitude" double precision
);

CREATE TABLE public."app_settings" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid,
 "setting_key" text NOT NULL,
 "setting_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "updated_by" uuid,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."expenses" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid,
 "title" text NOT NULL,
 "category" text DEFAULT 'أخرى'::text NOT NULL,
 "amount" numeric(14,2) NOT NULL,
 "expense_date" date DEFAULT CURRENT_DATE NOT NULL,
 "vendor" text DEFAULT ''::text NOT NULL,
 "notes" text,
 "receipt_url" text,
 "approved_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "legacy_id" text
);

CREATE TABLE public."announcements" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid,
 "title" text NOT NULL,
 "content" text NOT NULL,
 "announcement_type" text DEFAULT 'general'::text NOT NULL,
 "image_url" text,
 "pinned" boolean DEFAULT false NOT NULL,
 "created_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "archived_at" timestamp with time zone
);

CREATE TABLE public."exceptional_collections" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "building_id" uuid NOT NULL,
 "title" text NOT NULL,
 "description" text DEFAULT ''::text NOT NULL,
 "amount_mode" text NOT NULL,
 "total_amount" numeric(12,2),
 "per_apartment_amount" numeric(12,2),
 "target_apartment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
 "keywords" text[] DEFAULT '{}'::text[] NOT NULL,
 "notify_residents" boolean DEFAULT true NOT NULL,
 "status" text DEFAULT 'active'::text NOT NULL,
 "created_by" uuid,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."building_access_codes" (
 "building_id" uuid NOT NULL,
 "code" text NOT NULL,
 "created_by" uuid NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "revoked_at" timestamp with time zone
);

CREATE TABLE public."building_join_requests" (
 "id" uuid DEFAULT gen_random_uuid() NOT NULL,
 "user_id" uuid NOT NULL,
 "building_id" uuid NOT NULL,
 "full_name" text NOT NULL,
 "requested_floor" integer NOT NULL,
 "requested_unit_number" text NOT NULL,
 "resident_type" text NOT NULL,
 "status" text DEFAULT 'pending'::text NOT NULL,
 "reviewed_by" uuid,
 "reviewed_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "requested_label" text DEFAULT ''::text NOT NULL
);
ALTER TABLE public."building_poll_participation" ADD CONSTRAINT "building_poll_participation_pkey" PRIMARY KEY (poll_id, user_id);
ALTER TABLE public."building_polls" ADD CONSTRAINT "building_polls_pkey" PRIMARY KEY (id);
ALTER TABLE public."building_polls" ADD CONSTRAINT "building_polls_question_check" CHECK (((char_length(btrim(question)) >= 5) AND (char_length(btrim(question)) <= 300)));
ALTER TABLE public."building_polls" ADD CONSTRAINT "building_polls_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));
ALTER TABLE public."building_polls" ADD CONSTRAINT "building_polls_valid_period" CHECK ((ends_at > starts_at));
ALTER TABLE public."building_poll_options" ADD CONSTRAINT "building_poll_options_label_check" CHECK (((char_length(btrim(label)) >= 1) AND (char_length(btrim(label)) <= 120)));
ALTER TABLE public."building_poll_options" ADD CONSTRAINT "building_poll_options_pkey" PRIMARY KEY (id);
ALTER TABLE public."building_poll_options" ADD CONSTRAINT "building_poll_options_poll_id_label_key" UNIQUE (poll_id, label);
ALTER TABLE public."building_treasury_settings_audit" ADD CONSTRAINT "building_treasury_settings_audit_pkey" PRIMARY KEY (id);
ALTER TABLE public."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_device_id_key" UNIQUE (notification_id, device_id);
ALTER TABLE public."notification_deliveries" ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE public."app_release_notices" ADD CONSTRAINT "app_release_notices_body_check" CHECK (((length(body) >= 1) AND (length(body) <= 240)));
ALTER TABLE public."app_release_notices" ADD CONSTRAINT "app_release_notices_pkey" PRIMARY KEY (release_id);
ALTER TABLE public."app_release_notices" ADD CONSTRAINT "app_release_notices_title_check" CHECK (((length(title) >= 1) AND (length(title) <= 80)));
ALTER TABLE public."app_notifications" ADD CONSTRAINT "app_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."app_notifications" ADD CONSTRAINT "app_notifications_recipient_id_source_key_key" UNIQUE (recipient_id, source_key);
ALTER TABLE public."building_invites" ADD CONSTRAINT "building_invites_email_not_empty" CHECK ((length(TRIM(BOTH FROM invited_email)) > 3));
ALTER TABLE public."building_invites" ADD CONSTRAINT "building_invites_invite_code_key" UNIQUE (invite_code);
ALTER TABLE public."building_invites" ADD CONSTRAINT "building_invites_pkey" PRIMARY KEY (id);
ALTER TABLE public."payments" ADD CONSTRAINT "payments_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public."payments" ADD CONSTRAINT "payments_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE public."payments" ADD CONSTRAINT "payments_payment_type_check" CHECK ((payment_type = ANY (ARRAY['monthly'::text, 'exceptional'::text])));
ALTER TABLE public."payments" ADD CONSTRAINT "payments_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_resident_label_check" CHECK ((length(resident_label) <= 60));
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['building_admin'::text, 'owner'::text, 'tenant'::text, 'pending'::text])));
ALTER TABLE public."apartments" ADD CONSTRAINT "apartments_building_id_unit_number_key" UNIQUE (building_id, unit_number);
ALTER TABLE public."apartments" ADD CONSTRAINT "apartments_overdue_months_check" CHECK ((overdue_months >= 0));
ALTER TABLE public."apartments" ADD CONSTRAINT "apartments_payment_status_check" CHECK ((payment_status = ANY (ARRAY['paid'::text, 'overdue'::text, 'pending'::text])));
ALTER TABLE public."apartments" ADD CONSTRAINT "apartments_pkey" PRIMARY KEY (id);
ALTER TABLE public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_status_check" CHECK ((status = ANY (ARRAY['جديد'::text, 'قيد التنفيذ'::text, 'مكتمل'::text])));
ALTER TABLE public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_urgency_check" CHECK ((urgency = ANY (ARRAY['عاجل'::text, 'متوسط'::text, 'عادي'::text])));
ALTER TABLE public."facility_bookings" ADD CONSTRAINT "facility_bookings_pkey" PRIMARY KEY (id);
ALTER TABLE public."facility_bookings" ADD CONSTRAINT "facility_bookings_status_check" CHECK ((status = ANY (ARRAY['مؤكد'::text, 'قيد المراجعة'::text, 'ملغي'::text])));
ALTER TABLE public."payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_action_check" CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text])));
ALTER TABLE public."payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."engagement_messages" ADD CONSTRAINT "engagement_messages_body_key" UNIQUE (body);
ALTER TABLE public."engagement_messages" ADD CONSTRAINT "engagement_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."engagement_history" ADD CONSTRAINT "engagement_history_pkey" PRIMARY KEY (user_id, message_id);
ALTER TABLE public."engagement_history" ADD CONSTRAINT "engagement_history_user_id_day_slot_key" UNIQUE (user_id, day, slot);
ALTER TABLE public."push_devices" ADD CONSTRAINT "push_devices_pkey" PRIMARY KEY (id);
ALTER TABLE public."push_devices" ADD CONSTRAINT "push_devices_platform_check" CHECK ((platform = 'android'::text));
ALTER TABLE public."push_devices" ADD CONSTRAINT "push_devices_token_key" UNIQUE (token);
ALTER TABLE public."buildings" ADD CONSTRAINT "buildings_opening_balance_check" CHECK (((opening_balance IS NULL) OR ((opening_balance >= (0)::numeric) AND (opening_balance <= 9999999999.99))));
ALTER TABLE public."buildings" ADD CONSTRAINT "buildings_pkey" PRIMARY KEY (id);
ALTER TABLE public."buildings" ADD CONSTRAINT "buildings_total_units_check" CHECK ((total_units >= 0));
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_building_id_setting_key_key" UNIQUE (building_id, setting_key);
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_amount_check" CHECK ((amount > (0)::numeric));
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_pkey" PRIMARY KEY (id);
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_announcement_type_check" CHECK ((announcement_type = ANY (ARRAY['urgent'::text, 'maintenance'::text, 'meeting'::text, 'general'::text])));
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_amount_mode_check" CHECK ((amount_mode = ANY (ARRAY['total'::text, 'per_apartment'::text])));
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_amount_valid" CHECK ((((amount_mode = 'total'::text) AND (total_amount > (0)::numeric) AND (per_apartment_amount IS NULL)) OR ((amount_mode = 'per_apartment'::text) AND (per_apartment_amount > (0)::numeric) AND (total_amount IS NULL))));
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_pkey" PRIMARY KEY (id);
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'closed'::text])));
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_targets_nonempty" CHECK ((cardinality(target_apartment_ids) > 0));
ALTER TABLE public."building_access_codes" ADD CONSTRAINT "building_access_codes_code_key" UNIQUE (code);
ALTER TABLE public."building_access_codes" ADD CONSTRAINT "building_access_codes_pkey" PRIMARY KEY (building_id);
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_pkey" PRIMARY KEY (id);
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_requested_label_check" CHECK ((length(requested_label) <= 60));
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_resident_type_check" CHECK ((resident_type = ANY (ARRAY['owner'::text, 'tenant'::text])));
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public."building_poll_participation" ADD CONSTRAINT "building_poll_participation_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES building_polls(id) ON DELETE CASCADE;
ALTER TABLE public."building_poll_participation" ADD CONSTRAINT "building_poll_participation_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."building_poll_ballots" ADD CONSTRAINT "building_poll_ballots_option_id_fkey" FOREIGN KEY (option_id) REFERENCES building_poll_options(id) ON DELETE CASCADE;
ALTER TABLE public."building_poll_ballots" ADD CONSTRAINT "building_poll_ballots_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES building_polls(id) ON DELETE CASCADE;
ALTER TABLE public."building_polls" ADD CONSTRAINT "building_polls_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."building_polls" ADD CONSTRAINT "building_polls_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."building_poll_options" ADD CONSTRAINT "building_poll_options_poll_id_fkey" FOREIGN KEY (poll_id) REFERENCES building_polls(id) ON DELETE CASCADE;
ALTER TABLE public."building_treasury_settings_audit" ADD CONSTRAINT "building_treasury_settings_audit_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."building_treasury_settings_audit" ADD CONSTRAINT "building_treasury_settings_audit_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_id_fkey" FOREIGN KEY (device_id) REFERENCES push_devices(id) ON DELETE CASCADE;
ALTER TABLE public."notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES app_notifications(id) ON DELETE CASCADE;
ALTER TABLE public."app_notifications" ADD CONSTRAINT "app_notifications_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."app_notifications" ADD CONSTRAINT "app_notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."building_invites" ADD CONSTRAINT "building_invites_apartment_id_fkey" FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE CASCADE;
ALTER TABLE public."building_invites" ADD CONSTRAINT "building_invites_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."building_invites" ADD CONSTRAINT "building_invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id);
ALTER TABLE public."payments" ADD CONSTRAINT "payments_apartment_id_fkey" FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE RESTRICT;
ALTER TABLE public."payments" ADD CONSTRAINT "payments_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;
ALTER TABLE public."payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_apartment_id_fkey" FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."apartments" ADD CONSTRAINT "apartments_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;
ALTER TABLE public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_apartment_id_fkey" FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL;
ALTER TABLE public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;
ALTER TABLE public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."facility_bookings" ADD CONSTRAINT "facility_bookings_apartment_id_fkey" FOREIGN KEY (apartment_id) REFERENCES apartments(id) ON DELETE SET NULL;
ALTER TABLE public."facility_bookings" ADD CONSTRAINT "facility_bookings_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;
ALTER TABLE public."facility_bookings" ADD CONSTRAINT "facility_bookings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."engagement_history" ADD CONSTRAINT "engagement_history_message_id_fkey" FOREIGN KEY (message_id) REFERENCES engagement_messages(id);
ALTER TABLE public."engagement_history" ADD CONSTRAINT "engagement_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."app_settings" ADD CONSTRAINT "app_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."expenses" ADD CONSTRAINT "expenses_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."exceptional_collections" ADD CONSTRAINT "exceptional_collections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."building_access_codes" ADD CONSTRAINT "building_access_codes_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."building_access_codes" ADD CONSTRAINT "building_access_codes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_building_id_fkey" FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."building_join_requests" ADD CONSTRAINT "building_join_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX building_poll_ballots_poll_option_idx ON public.building_poll_ballots USING btree (poll_id, option_id);
CREATE INDEX building_polls_building_created_idx ON public.building_polls USING btree (building_id, created_at DESC);
CREATE INDEX building_poll_options_poll_idx ON public.building_poll_options USING btree (poll_id, sort_order);
CREATE INDEX building_treasury_settings_audit_building_idx ON public.building_treasury_settings_audit USING btree (building_id, created_at DESC);
CREATE INDEX notification_deliveries_pending ON public.notification_deliveries USING btree (available_at) WHERE (completed_at IS NULL);
CREATE INDEX app_notifications_recipient_created_idx ON public.app_notifications USING btree (recipient_id, building_id, created_at DESC);
CREATE INDEX app_notifications_unread_idx ON public.app_notifications USING btree (recipient_id, building_id) WHERE (read_at IS NULL);
CREATE INDEX building_invites_building_id_idx ON public.building_invites USING btree (building_id);
CREATE INDEX building_invites_email_idx ON public.building_invites USING btree (lower(invited_email));
CREATE INDEX building_invites_phone_idx ON public.building_invites USING btree (invited_phone) WHERE (invited_phone IS NOT NULL);
CREATE INDEX payments_building_date_idx ON public.payments USING btree (building_id, payment_date DESC);
CREATE INDEX payments_apartment_month_idx ON public.payments USING btree (apartment_id, month);
CREATE UNIQUE INDEX payments_building_legacy_id_uidx ON public.payments USING btree (building_id, legacy_id) WHERE (legacy_id IS NOT NULL);
CREATE INDEX apartments_building_idx ON public.apartments USING btree (building_id);
CREATE INDEX tickets_building_status_idx ON public.maintenance_tickets USING btree (building_id, status);
CREATE INDEX push_devices_user_id_idx ON public.push_devices USING btree (user_id);
CREATE INDEX expenses_building_date_idx ON public.expenses USING btree (building_id, expense_date DESC);
CREATE UNIQUE INDEX expenses_building_legacy_id_uidx ON public.expenses USING btree (building_id, legacy_id) WHERE (legacy_id IS NOT NULL);
CREATE INDEX announcements_building_date_idx ON public.announcements USING btree (building_id, created_at DESC);
CREATE INDEX exceptional_collections_building_created_idx ON public.exceptional_collections USING btree (building_id, created_at DESC);
CREATE INDEX building_join_requests_building_status_idx ON public.building_join_requests USING btree (building_id, status, created_at DESC);
CREATE INDEX building_join_requests_user_idx ON public.building_join_requests USING btree (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.revoke_building_access_code(target_building_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.app_user_id() is null or not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'غير مصرح بإدارة كود هذه العمارة' using errcode = '42501';
  end if;
  update public.building_access_codes set revoked_at = now()
  where building_id = target_building_id and revoked_at is null;
  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, full_name, phone, role, approved)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.phone, ''), 'pending', false)
  on conflict (id) do update
    set phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
        full_name = case when public.profiles.full_name = '' then excluded.full_name else public.profiles.full_name end,
        updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_bunyan_building(target_building_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.app_user_id())
      and p.approved = true
      and p.disabled_at is null
      and p.role = 'building_admin'
      and p.building_id = target_building_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_active_bunyan_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.app_user_id())
      and p.approved = true
      and p.role in ('super_admin', 'assistant_admin')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.approve_registration(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.app_user_id() and p.role = 'super_admin' and p.approved = true
  ) then
    raise exception 'Only the active super admin can approve registrations';
  end if;
  update public.profiles
  set role = 'tenant', approved = true, updated_at = now()
  where id = target_user_id and role = 'pending' and approved = false;
  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_pending_registrations()
 RETURNS TABLE(user_id uuid, email text, full_name text, registered_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.app_user_id() and p.role = 'super_admin' and p.approved = true
  ) then
    raise exception 'Only the active super admin can review registrations';
  end if;
  return query
  select p.id, u.email::text, coalesce(p.full_name, ''), u.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'pending' and p.approved = false
  order by u.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_bunyan_user_role(target_user_id uuid, target_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.profiles p where p.id=(select auth.app_user_id()) and p.approved=true and p.role='super_admin' and p.disabled_at is null) then
  raise exception 'Only the primary administrator can change account roles';
 end if;
 if target_user_id=(select auth.app_user_id()) then raise exception 'You cannot change your own primary administrator role'; end if;
 if target_role not in ('super_admin','tenant') then raise exception 'Unsupported target role'; end if;
 if target_role='super_admin' then
  update public.profiles set role='super_admin',approved=true,building_id=null,apartment_id=null,disabled_at=null,updated_at=now() where id=target_user_id;
  update auth.users set banned_until=null where id=target_user_id;
 else
  update public.profiles set role='tenant',approved=true,disabled_at=null,updated_at=now() where id=target_user_id;
  update auth.users set banned_until=null where id=target_user_id;
 end if;
 return found;
end;$function$
;

CREATE OR REPLACE FUNCTION public.reject_building_join_request(target_request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.building_join_requests%rowtype;
begin
  if auth.app_user_id() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into request_row from public.building_join_requests
  where id = target_request_id for update;
  if not found or not public.can_manage_bunyan_building(request_row.building_id) then
    raise exception 'طلب الانضمام غير موجود أو غير مصرح به' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then raise exception 'تمت مراجعة هذا الطلب بالفعل'; end if;

  update public.building_join_requests
  set status = 'rejected', reviewed_by = auth.app_user_id(), reviewed_at = now()
  where id = target_request_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_user_id uuid := auth.app_user_id();
  confirmed_at timestamptz;
  existing_admin_count integer;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(741852963);
  select email_confirmed_at into confirmed_at from auth.users where id = current_user_id;
  if confirmed_at is null then return false; end if;
  select count(*) into existing_admin_count from public.profiles where role = 'super_admin';
  if existing_admin_count > 0 then return false; end if;
  update public.profiles set role = 'super_admin', approved = true, updated_at = now()
  where id = current_user_id and role = 'pending';
  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_registration_as_super_admin(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.app_user_id())
      and p.approved = true
      and p.role = 'super_admin'
  ) then
    raise exception 'Only the primary super administrator can grant full administrator access';
  end if;

  update public.profiles
  set role = 'super_admin',
      approved = true,
      building_id = null,
      apartment_id = null,
      updated_at = now()
  where id = target_user_id
    and role in ('pending', 'tenant', 'owner', 'assistant_admin');

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.disable_bunyan_user(target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.profiles p where p.id=(select auth.app_user_id()) and p.approved=true and p.role='super_admin' and p.disabled_at is null) then
  raise exception 'Only the primary administrator can disable accounts';
 end if;
 if target_user_id=(select auth.app_user_id()) then raise exception 'You cannot disable your own account'; end if;
 update public.profiles set role='pending',approved=false,disabled_at=now(),updated_at=now() where id=target_user_id;
 if not found then return false; end if;
 update auth.users set banned_until='infinity'::timestamptz where id=target_user_id;
 delete from public.push_devices where user_id=target_user_id;
 return true;
end;$function$
;

CREATE OR REPLACE FUNCTION public.list_resident_access_requests()
 RETURNS TABLE(user_id uuid, email text, full_name text, registered_at timestamp with time zone, approved boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_active_bunyan_admin() then
    raise exception 'Only active building administrators can review residents';
  end if;
  return query
  select p.id, u.email::text, coalesce(p.full_name,''), u.created_at, p.approved
  from public.profiles p
  join auth.users u on u.id=p.id
  where p.role in ('pending','tenant')
    and (p.approved = false or p.building_id is null or p.apartment_id is null)
  order by u.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_egyptian_phone(p_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if left(digits, 4) = '0020' then digits := substr(digits, 3); end if;
  if length(digits) = 12 and left(digits, 3) = '201' then return '+' || digits; end if;
  if length(digits) = 11 and left(digits, 2) = '01' then return '+2' || digits; end if;
  raise exception 'أدخل رقم موبايل مصري صحيح.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_building_invite(target_building_id uuid, target_apartment_id uuid, target_email text)
 RETURNS TABLE(invite_code uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_email text := lower(trim(target_email));
  created_code uuid;
  expiry timestamptz;
begin
  if auth.app_user_id() is null then
    raise exception 'Authentication required';
  end if;
  if not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'Not authorized to manage this building';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'A valid email address is required';
  end if;
  if not exists (
    select 1 from public.apartments a
    where a.id = target_apartment_id and a.building_id = target_building_id
  ) then
    raise exception 'Apartment does not belong to this building';
  end if;

  insert into public.building_invites (
    building_id, apartment_id, invited_email, invited_by
  )
  values (target_building_id, target_apartment_id, normalized_email, auth.app_user_id())
  returning building_invites.invite_code, building_invites.expires_at
  into created_code, expiry;

  return query select created_code, expiry;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_all_bunyan_users()
 RETURNS TABLE(user_id uuid, email text, phone text, full_name text, role text, approved boolean, building_id uuid, apartment_id uuid, registered_at timestamp with time zone, disabled_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.app_user_id()) and p.approved = true
      and p.role = 'super_admin' and p.disabled_at is null
  ) then
    raise exception 'Only the primary administrator can manage registered accounts';
  end if;

  return query
  select p.id, u.email::text, p.phone, coalesce(p.full_name, ''), p.role,
         p.approved, p.building_id, p.apartment_id, u.created_at, p.disabled_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by u.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_building_phone_invite(target_building_id uuid, target_apartment_id uuid, target_phone text, target_name text)
 RETURNS TABLE(invite_code text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  normalized_phone text := public.normalize_egyptian_phone(target_phone);
  normalized_name text := nullif(trim(target_name), '');
  created_code uuid;
  expiry timestamptz;
begin
  if auth.app_user_id() is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'Not authorized to manage this building';
  end if;
  if normalized_name is null or length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'اكتب اسم الساكن بشكل صحيح.';
  end if;
  if not exists (select 1 from public.apartments a where a.id = target_apartment_id and a.building_id = target_building_id) then
    raise exception 'Apartment does not belong to this building';
  end if;
  insert into public.building_invites (
    building_id, apartment_id, invited_email, invited_phone, invited_name, invited_by, expires_at
  ) values (
    target_building_id, target_apartment_id, null, normalized_phone, normalized_name, auth.app_user_id(), now() + interval '48 hours'
  ) returning building_invites.invite_code, building_invites.expires_at into created_code, expiry;
  return query select 'PH-' || created_code::text, expiry;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_building_for_current_user(building_name text, building_address text DEFAULT ''::text, units_count integer DEFAULT 0, floors_count integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_id uuid := auth.app_user_id();
  new_building_id uuid;
  profile_row public.profiles%rowtype;
  identity_confirmed boolean;
begin
  if current_id is null then raise exception 'Authentication required'; end if;

  select (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    into identity_confirmed from auth.users u where u.id = current_id;
  if coalesce(identity_confirmed, false) is not true then
    raise exception 'Confirm your email or mobile number before creating a building';
  end if;

  if nullif(trim(building_name), '') is null then raise exception 'Building name is required'; end if;
  if coalesce(units_count, 0) < 0 or (floors_count is not null and floors_count < 0) then
    raise exception 'Unit and floor counts cannot be negative';
  end if;

  select * into profile_row from public.profiles where id = current_id for update;
  if not found or profile_row.role <> 'pending' or profile_row.approved or profile_row.disabled_at is not null then
    raise exception 'This account is not eligible to create a building';
  end if;
  if profile_row.building_id is not null then raise exception 'This account is already assigned to a building'; end if;

  insert into public.buildings (name, address, total_units, total_floors, manager_name)
  values (trim(building_name), coalesce(trim(building_address), ''), coalesce(units_count, 0),
          floors_count, coalesce(profile_row.full_name, ''))
  returning id into new_building_id;

  if coalesce(units_count, 0) > 0 then
    insert into public.apartments (building_id, unit_number, floor)
    select new_building_id, units.unit_no::text,
      case when coalesce(floors_count, 0) > 0
        then ceil(units.unit_no::numeric / ceil(units_count::numeric / floors_count::numeric))::integer
        else 1 end
    from generate_series(1, units_count) as units(unit_no);
  end if;

  update public.profiles set role = 'building_admin', approved = true,
    building_id = new_building_id, apartment_id = null, updated_at = now()
  where id = current_id;
  return new_building_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_building_phone_invite(target_invite_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_id uuid := auth.app_user_id();
  current_phone text;
  phone_confirmed_at timestamptz;
  invite_uuid uuid;
  invite_row public.building_invites%rowtype;
  apartment_owner boolean;
  profile_row public.profiles%rowtype;
begin
  if current_id is null then raise exception 'Authentication required'; end if;
  if target_invite_code !~* '^PH-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'كود الدعوة غير صحيح.';
  end if;
  invite_uuid := substring(target_invite_code from 4)::uuid;
  select public.normalize_egyptian_phone(u.phone), u.phone_confirmed_at
    into current_phone, phone_confirmed_at
  from auth.users u where u.id = current_id;
  if current_phone is null or phone_confirmed_at is null then
    raise exception 'يجب تأكيد رقم الموبايل برسالة SMS أولاً.';
  end if;
  select * into invite_row from public.building_invites i
  where i.invite_code = invite_uuid and i.invited_phone = current_phone
    and i.accepted_at is null and i.expires_at > now()
  for update;
  if not found then raise exception 'الدعوة غير صالحة أو منتهية أو مخصصة لرقم موبايل آخر.'; end if;
  select * into profile_row from public.profiles p where p.id = current_id for update;
  if not found or profile_row.role <> 'pending' or profile_row.approved
     or profile_row.disabled_at is not null or profile_row.building_id is not null then
    raise exception 'هذا الحساب مرتبط بعقار بالفعل أو غير مؤهل لقبول الدعوة.';
  end if;
  select a.is_owner into apartment_owner from public.apartments a
  where a.id = invite_row.apartment_id and a.building_id = invite_row.building_id;
  if not found then raise exception 'الشقة المرتبطة بالدعوة لم تعد متاحة.'; end if;
  update public.profiles
  set full_name = coalesce(invite_row.invited_name, full_name), phone = current_phone,
      role = case when apartment_owner then 'owner' else 'tenant' end,
      approved = true, building_id = invite_row.building_id, apartment_id = invite_row.apartment_id,
      updated_at = now()
  where id = current_id;
  update public.apartments
  set resident_name = coalesce(invite_row.invited_name, resident_name), resident_phone = current_phone, updated_at = now()
  where id = invite_row.apartment_id and building_id = invite_row.building_id;
  update public.building_invites set accepted_at = now() where id = invite_row.id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_building_users()
 RETURNS TABLE(user_id uuid, email text, phone text, full_name text, role text, approved boolean, building_id uuid, apartment_id uuid, registered_at timestamp with time zone, disabled_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  manager_building_id uuid;
  manager_role text;
begin
  select p.building_id, p.role
    into manager_building_id, manager_role
  from public.profiles p
  where p.id = (select auth.app_user_id())
    and p.approved = true
    and p.disabled_at is null;

  if (select auth.app_user_id()) is null
     or manager_role <> 'building_admin'
     or manager_building_id is null
     or not public.can_manage_bunyan_building(manager_building_id) then
    raise exception 'Not authorized to list building users' using errcode = '42501';
  end if;

  return query
  select p.id, u.email::text, p.phone, coalesce(p.full_name, ''), p.role,
         p.approved, p.building_id, p.apartment_id, u.created_at, p.disabled_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.building_id = manager_building_id
  order by u.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_or_rotate_building_access_code(target_building_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_code text;
begin
  if auth.app_user_id() is null or not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'غير مصرح بإدارة كود هذه العمارة' using errcode = '42501';
  end if;

  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.building_access_codes(building_id, code, created_by, created_at, revoked_at)
  values (target_building_id, new_code, auth.app_user_id(), now(), null)
  on conflict (building_id) do update
    set code = excluded.code, created_by = excluded.created_by,
        created_at = excluded.created_at, revoked_at = null;
  return new_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_and_assign_registration(target_user_id uuid, target_apartment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_building_id uuid;
  target_is_owner boolean;
  target_email_confirmed_at timestamptz;
begin
  select a.building_id, a.is_owner
    into target_building_id, target_is_owner
  from public.apartments a
  where a.id = target_apartment_id;

  if target_building_id is null then
    raise exception 'Apartment not found';
  end if;

  if not public.can_manage_bunyan_building(target_building_id) then
    raise exception 'Not authorized to approve users for this building';
  end if;

  select u.email_confirmed_at into target_email_confirmed_at
  from auth.users u where u.id = target_user_id;
  if target_email_confirmed_at is null then
    raise exception 'The resident must confirm their email before approval';
  end if;

  update public.profiles
  set role = case when coalesce(target_is_owner, false) then 'owner' else 'tenant' end,
      approved = true,
      building_id = target_building_id,
      apartment_id = target_apartment_id,
      updated_at = now()
  where id = target_user_id
    and role = 'pending'
    and approved = false
    and building_id is null
    and apartment_id is null
    and disabled_at is null;

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.accept_building_invite(target_invite_code uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_id uuid := auth.app_user_id();
  current_email text;
  email_confirmed_at timestamptz;
  invite_row public.building_invites%rowtype;
  apartment_owner boolean;
  profile_row public.profiles%rowtype;
begin
  if current_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(u.email), u.email_confirmed_at into current_email, email_confirmed_at
  from auth.users u where u.id = current_id;
  if email_confirmed_at is null then
    raise exception 'Confirm your email before accepting an invitation';
  end if;

  select * into invite_row
  from public.building_invites i
  where i.invite_code = target_invite_code
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;
  if current_email is null or current_email <> lower(invite_row.invited_email) then
    raise exception 'This invitation belongs to a different email address';
  end if;

  select * into profile_row
  from public.profiles p where p.id = current_id for update;

  if not found or profile_row.role <> 'pending' or profile_row.approved
     or profile_row.disabled_at is not null
     or profile_row.building_id is not null then
    raise exception 'This account is already assigned or is not eligible';
  end if;

  select a.is_owner into apartment_owner
  from public.apartments a
  where a.id = invite_row.apartment_id
    and a.building_id = invite_row.building_id;

  if not found then
    raise exception 'The invited apartment is no longer available';
  end if;

  update public.profiles
  set role = case when apartment_owner then 'owner' else 'tenant' end,
      approved = true,
      building_id = invite_row.building_id,
      apartment_id = invite_row.apartment_id,
      updated_at = now()
  where id = current_id;

  update public.building_invites
  set accepted_at = now()
  where id = invite_row.id;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cast_building_poll_vote(p_poll_id uuid, p_option_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile record;
  v_poll record;
  v_inserted_poll_id uuid;
begin
  if auth.app_user_id() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select role, approved, building_id, apartment_id, disabled_at
    into v_profile
    from public.profiles
   where id = auth.app_user_id();

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
  values (p_poll_id, auth.app_user_id())
  on conflict do nothing
  returning poll_id into v_inserted_poll_id;

  if v_inserted_poll_id is null then
    raise exception 'You have already voted in this poll';
  end if;

  insert into public.building_poll_ballots (poll_id, option_id)
  values (p_poll_id, p_option_id);

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_building_financial_summary(p_building_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.app_user_id();
  v_profile record;
  v_building record;
  v_collected numeric := 0;
  v_expenses numeric := 0;
  v_outstanding numeric := 0;
  v_monthly jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_apartments jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select role, approved, building_id, apartment_id, disabled_at
    into v_profile from public.profiles where id = v_uid;

  if not found or v_profile.approved is distinct from true or v_profile.disabled_at is not null then
    raise exception 'Approved account required' using errcode = '42501';
  end if;

  if v_profile.role not in ('tenant','owner','building_admin') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  if v_profile.role in ('tenant','owner') and v_profile.building_id is distinct from p_building_id then
    raise exception 'Building access denied' using errcode = '42501';
  end if;

  if v_profile.role = 'building_admin'
     and not public.can_manage_bunyan_building(p_building_id) then
    raise exception 'Building access denied' using errcode = '42501';
  end if;

  select id, balance into v_building
    from public.buildings where id = p_building_id;
  if not found then
    raise exception 'Building not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(amount),0) into v_collected
    from public.payments where building_id = p_building_id;

  select coalesce(sum(amount),0) into v_expenses
    from public.expenses where building_id = p_building_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'unit_number', a.unit_number,
      'total_paid', coalesce(p.total_paid, a.paid_amount, 0),
      'remaining', greatest(
        (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
        - coalesce(p.total_paid, a.paid_amount, 0), 0
      ),
      'status', case
        when greatest((a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
          - coalesce(p.total_paid, a.paid_amount, 0),0) = 0 then 'paid'
        when coalesce(p.total_paid, a.paid_amount, 0) > 0 then 'partial'
        when coalesce(a.overdue_months,0) > 0 then 'overdue'
        else 'pending'
      end
    ) order by a.unit_number), '[]'::jsonb)
    into v_apartments
    from public.apartments a
    left join (
      select apartment_id, sum(amount) as total_paid
        from public.payments
       where building_id = p_building_id
         and coalesce(payment_type, 'monthly') <> 'exceptional'
       group by apartment_id
    ) p on p.apartment_id = a.id
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);

  select coalesce(sum(greatest(
      (a.monthly_fee * greatest(coalesce(a.overdue_months,0),1))
      - coalesce(p.total_paid, a.paid_amount, 0), 0
    )),0)
    into v_outstanding
    from public.apartments a
    left join (
      select apartment_id, sum(amount) as total_paid
        from public.payments
       where building_id = p_building_id
         and coalesce(payment_type, 'monthly') <> 'exceptional'
       group by apartment_id
    ) p on p.apartment_id = a.id
   where a.building_id = p_building_id
     and (v_profile.role = 'building_admin' or a.id = v_profile.apartment_id);

  select coalesce(jsonb_agg(jsonb_build_object(
      'month', to_char(m.month_start,'YYYY-MM'),
      'income', m.income,
      'expenses', m.expenses
    ) order by m.month_start), '[]'::jsonb)
    into v_monthly
    from (
      select month_start, coalesce(sum(income),0) as income, coalesce(sum(expenses),0) as expenses
      from (
        select date_trunc('month', payment_date)::date as month_start, sum(amount) as income, 0::numeric as expenses
          from public.payments where building_id = p_building_id
           and payment_date >= (date_trunc('month', current_date) - interval '11 months')::date group by 1
        union all
        select date_trunc('month', expense_date)::date as month_start, 0::numeric as income, sum(amount) as expenses
          from public.expenses where building_id = p_building_id
           and expense_date >= (date_trunc('month', current_date) - interval '11 months')::date group by 1
      ) movements group by month_start
    ) m;

  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount', amount) order by amount desc), '[]'::jsonb)
    into v_categories
    from (select category, sum(amount) as amount from public.expenses where building_id = p_building_id group by category) c;

  return jsonb_build_object(
    'total_collected', v_collected,
    'total_expenses', v_expenses,
    'outstanding_amount', v_outstanding,
    'treasury_balance', coalesce(v_building.balance,0),
    'monthly', v_monthly,
    'expense_categories', v_categories,
    'apartments', v_apartments
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_building_poll(p_building_id uuid, p_question text, p_description text, p_options jsonb, p_ends_at timestamp with time zone, p_show_results_before_close boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_poll_id uuid;
  v_option text;
  v_order integer := 0;
begin
  if auth.app_user_id() is null or not public.can_manage_bunyan_building(p_building_id) then
    raise exception 'Building manager access required' using errcode = '42501';
  end if;

  if p_question is null or char_length(btrim(p_question)) not between 5 and 300 then
    raise exception 'Question must be between 5 and 300 characters';
  end if;

  if p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '30 days' then
    raise exception 'Poll duration must be in the next 30 days';
  end if;

  if p_options is null or jsonb_typeof(p_options) is distinct from 'array' then
    raise exception 'Poll options must be a JSON array';
  end if;

  if jsonb_array_length(p_options) not between 2 and 8 then
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
    p_building_id, auth.app_user_id(), btrim(p_question), coalesce(btrim(p_description), ''),
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
$function$
;

CREATE OR REPLACE FUNCTION public.close_building_poll(p_poll_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.app_user_id() is null then
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_building_poll_results(p_poll_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if auth.app_user_id() is null then
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
   where id = auth.app_user_id();

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

  update public.building_polls
     set status = 'closed', closed_at = coalesce(closed_at, now())
   where id = p_poll_id and status = 'active' and ends_at <= now();
  if found then
    v_poll.status := 'closed';
  end if;

  select exists (
    select 1 from public.building_poll_participation
    where poll_id = p_poll_id and user_id = auth.app_user_id()
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
    'participants_count', case when v_results_visible then v_participants else null end,
    'targeted_count', case when v_results_visible then v_targeted else null end,
    'non_participants_count', case when v_results_visible then greatest(v_targeted - v_participants, 0) else null end,
    'turnout_percentage', case
      when not v_results_visible then null
      when v_targeted > 0 then round(v_participants * 100.0 / v_targeted, 1)
      else 0
    end,
    'options', v_options
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_exceptional_collection(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.app_user_id();
  target_count integer;
  expected_total numeric(12,2);
  amount_each numeric(12,2);
  inserted_id uuid;
  apt record;
  inserted_total numeric(12,2) := 0;
  payment_month text := 'تحصيل استثنائي';
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_bunyan_building(p_building_id) then raise exception 'Building admin permission required'; end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'Collection title is required'; end if;
  if p_amount_mode not in ('total', 'per_apartment') then raise exception 'Invalid amount mode'; end if;
  if coalesce(array_length(p_target_apartment_ids, 1), 0) = 0 then raise exception 'Select at least one apartment'; end if;

  select count(*) into target_count
  from public.apartments a
  where a.building_id = p_building_id and a.id = any(p_target_apartment_ids);
  if target_count <> cardinality(p_target_apartment_ids) then raise exception 'One or more apartments do not belong to this building'; end if;

  if p_amount_mode = 'total' then
    if coalesce(p_total_amount, 0) <= 0 then raise exception 'Total amount must be positive'; end if;
    expected_total := round(p_total_amount, 2);
    amount_each := round(expected_total / target_count, 2);
  else
    if coalesce(p_per_apartment_amount, 0) <= 0 then raise exception 'Per-apartment amount must be positive'; end if;
    amount_each := round(p_per_apartment_amount, 2);
    expected_total := amount_each * target_count;
  end if;

  insert into public.exceptional_collections (
    building_id, title, description, amount_mode, total_amount, per_apartment_amount,
    target_apartment_ids, notify_residents, created_by
  ) values (
    p_building_id, btrim(p_title), coalesce(p_description, ''), p_amount_mode,
    case when p_amount_mode = 'total' then expected_total else null end,
    case when p_amount_mode = 'per_apartment' then amount_each else null end,
    p_target_apartment_ids, coalesce(p_notify_residents, true), actor
  ) returning id into inserted_id;

  for apt in
    select a.id, a.unit_number, a.resident_name
    from public.apartments a
    where a.building_id = p_building_id and a.id = any(p_target_apartment_ids)
    order by a.unit_number
  loop
    -- Put any rounding remainder on the final apartment so ledger total matches exactly.
    declare line_amount numeric(12,2);
    begin
      if p_amount_mode = 'total' and apt.id = (
        select a2.id from public.apartments a2
        where a2.building_id = p_building_id and a2.id = any(p_target_apartment_ids)
        order by a2.unit_number desc limit 1
      ) then
        line_amount := expected_total - inserted_total;
      else
        line_amount := amount_each;
      end if;
      insert into public.payments (
        apartment_id, building_id, unit_number, resident_name, amount,
        payment_date, month, method, notes, recorded_by, payment_type
      ) values (
        apt.id, p_building_id, apt.unit_number, coalesce(apt.resident_name, ''),
        line_amount, current_date, payment_month, 'تحصيل استثنائي',
        btrim(p_title) || case when coalesce(p_description, '') = '' then '' else ' - ' || p_description end,
        actor, 'exceptional'
      );
      inserted_total := inserted_total + line_amount;
    end;
  end loop;

  update public.buildings
  set balance = balance + inserted_total, updated_at = now()
  where id = p_building_id;

  return jsonb_build_object('collection_id', inserted_id, 'total_amount', inserted_total, 'target_count', target_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_mobile_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.category in ('announcements','payments','expenses','maintenance_tickets','app_updates','engagement') then
    insert into public.notification_deliveries(notification_id,device_id)
    select new.id,d.id from public.push_devices d where d.user_id=new.recipient_id
    on conflict do nothing;
  end if;
  return null;
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_building_with_opening_balance(building_name text, building_address text DEFAULT ''::text, units_count integer DEFAULT 0, floors_count integer DEFAULT NULL::integer, opening_balance numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare new_building_id uuid;
begin
  if auth.app_user_id() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if opening_balance is null or not (opening_balance between 0 and 9999999999.99)
     or opening_balance <> round(opening_balance, 2) then
    raise exception 'الرصيد الافتتاحي غير صحيح؛ أدخل مبلغًا من صفر إلى 9,999,999,999.99 بمنزلتين عشريتين كحد أقصى'
      using errcode = '22023';
  end if;
  new_building_id := public.create_building_for_current_user(building_name, building_address, units_count, floors_count);
  update public.buildings b set balance = create_building_with_opening_balance.opening_balance,
    opening_balance = create_building_with_opening_balance.opening_balance
  where b.id = new_building_id;
  return new_building_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_building_treasury_settings(target_building_id uuid, new_opening_balance numeric, new_reserve_fund numeric, expected_balance numeric, expected_opening_balance numeric, expected_reserve_fund numeric, opening_already_included boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.buildings%rowtype;
  next_balance numeric;
  cash_delta numeric;
begin
  -- Trust the stored active manager profile, never client-supplied role claims.
  perform 1 from public.profiles p where p.id = auth.app_user_id() and p.approved
    and p.disabled_at is null and p.role = 'building_admin'
    and p.building_id = target_building_id for update;
  if not found then raise exception 'غير مصرح بتعديل إعدادات هذه العمارة' using errcode = '42501'; end if;
  if new_opening_balance is null or new_reserve_fund is null
     or not (new_opening_balance between 0 and 9999999999.99)
     or not (new_reserve_fund between 0 and 9999999999.99)
     or new_opening_balance <> round(new_opening_balance, 2)
     or new_reserve_fund <> round(new_reserve_fund, 2) then
    raise exception 'أدخل مبالغ صحيحة غير سالبة بمنزلتين عشريتين كحد أقصى' using errcode = '22023';
  end if;
  select * into existing from public.buildings where id = target_building_id for update;
  if not found then raise exception 'العمارة غير موجودة'; end if;
  if existing.balance is distinct from expected_balance
     or existing.opening_balance is distinct from expected_opening_balance
     or existing.reserve_fund is distinct from expected_reserve_fund then
    raise exception 'تغيرت الأرصدة منذ فتح الصفحة. حدّث البيانات وراجع المبالغ قبل الحفظ.' using errcode = '40001';
  end if;
  if existing.opening_balance is null and opening_already_included is null then
    raise exception 'حدد هل الرصيد الافتتاحي مشمول بالفعل في رصيد الخزينة الحالي' using errcode = '22023';
  end if;
  cash_delta := case when existing.opening_balance is null and opening_already_included
    then 0 else new_opening_balance - coalesce(existing.opening_balance, 0) end;
  next_balance := existing.balance + cash_delta;
  if next_balance < 0 or next_balance > 999999999999.99 then
    raise exception 'التعديل سيجعل رصيد الخزينة خارج النطاق المسموح' using errcode = '22023';
  end if;
  update public.buildings set opening_balance = new_opening_balance,
    reserve_fund = new_reserve_fund, balance = next_balance, updated_at = now()
  where id = target_building_id;
  if existing.opening_balance is distinct from new_opening_balance
     or existing.reserve_fund is distinct from new_reserve_fund then
    insert into public.building_treasury_settings_audit(building_id,
      previous_opening_balance, opening_balance, previous_reserve_fund, reserve_fund,
      previous_balance, balance, opening_already_included, changed_by)
    values(target_building_id, existing.opening_balance, new_opening_balance,
      existing.reserve_fund, new_reserve_fund, existing.balance, next_balance,
      coalesce(opening_already_included, true), auth.app_user_id());
  end if;
  return jsonb_build_object('balance', next_balance, 'opening_balance', new_opening_balance, 'reserve_fund', new_reserve_fund);
end;
$function$
;

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
      message:='شقة ' || coalesce(item->>'unit_number','') || ' • ' || coalesce(item->>'amount','0') || ' ج.م';
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
    and (p.role='building_admin' or (p.role in ('owner','tenant') and
      (audience='all' or (audience='apartment' and p.apartment_id=apt) or (audience='user' and p.id=target_user))))
  on conflict(recipient_id,source_key) do nothing;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_building_join_request(target_code text, applicant_full_name text, applicant_floor integer, applicant_unit_number text, applicant_resident_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid:=auth.app_user_id(); bld uuid; request_id uuid; p public.profiles%rowtype;
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
$function$
;

CREATE OR REPLACE FUNCTION public.approve_building_join_request(target_request_id uuid, target_apartment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare label text;
begin
  select coalesce(nullif(requested_label,''),case resident_type when 'owner' then 'مالك' else 'مستأجر' end) into label
  from public.building_join_requests where id=target_request_id;
  return public.approve_building_join_request_with_label(target_request_id,target_apartment_id,label);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_building_join_request_with_label(target_request_id uuid, target_apartment_id uuid, member_label text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  request_row public.building_join_requests%rowtype; apt public.apartments%rowtype; applicant public.profiles%rowtype;
  label text:=btrim(member_label);
begin
  if auth.app_user_id() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into request_row from public.building_join_requests where id=target_request_id;
  if not found or not public.can_manage_bunyan_building(request_row.building_id) then raise exception 'طلب الانضمام غير موجود أو غير مصرح به' using errcode='42501'; end if;
  perform 1 from public.profiles where id=auth.app_user_id() and role='building_admin' and approved and disabled_at is null and building_id=request_row.building_id for update;
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
  update public.building_join_requests set status='approved',reviewed_by=auth.app_user_id(),reviewed_at=now() where id=target_request_id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_building_member(target_building_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare member public.profiles%rowtype;
begin
  perform 1 from public.profiles where id=auth.app_user_id() and role='building_admin' and approved and disabled_at is null and building_id=target_building_id for update;
  if not found then raise exception 'غير مصرح بحذف أعضاء هذه العمارة' using errcode='42501'; end if;
  select * into member from public.profiles where id=target_user_id and building_id=target_building_id and approved and role in ('owner','tenant') for update;
  if not found then raise exception 'العضو غير موجود أو سبق حذفه'; end if;
  -- Keep Auth identity, historical approvals, apartment and financial records.
  -- Clearing membership immediately revokes all profile-based building access.
  update public.profiles set role='pending',approved=false,building_id=null,apartment_id=null,resident_label='',updated_at=now() where id=member.id;
  delete from public.push_devices where user_id=member.id;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_building_member_label(target_building_id uuid, target_user_id uuid, member_label text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.profiles where id=auth.app_user_id() and role='building_admin' and approved and disabled_at is null and building_id=target_building_id for update;
  if not found then raise exception 'غير مصرح بإدارة أعضاء هذه العمارة' using errcode='42501'; end if;
  if member_label is null or length(btrim(member_label))<1 or length(btrim(member_label))>60 then raise exception 'اكتب الصفة في حدود 60 حرفًا'; end if;
  update public.profiles set resident_label=btrim(member_label),updated_at=now() where id=target_user_id and building_id=target_building_id and approved and disabled_at is null and role in ('owner','tenant');
  if not found then raise exception 'العضو غير موجود أو غير متاح'; end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_mobile_notifications(batch_size integer DEFAULT 40)
 RETURNS TABLE(delivery_id uuid, lease_id uuid, notification_id uuid, device_id uuid, token text, title text, body text, category text, building_id uuid)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  with candidates as (
    select d.id from public.notification_deliveries d
    where d.completed_at is null and d.available_at<=now() and d.attempts<8
    order by d.available_at limit least(greatest(batch_size,1),100)
    for update skip locked
  ), claimed as (
    update public.notification_deliveries d set attempts=d.attempts+1,
      available_at=now()+interval '5 minutes',lease_id=gen_random_uuid()
    from candidates c where d.id=c.id returning d.*
  )
  select c.id,c.lease_id,n.id,pd.id,pd.token,n.title,n.body,n.category,n.building_id
  from claimed c join public.app_notifications n on n.id=c.notification_id
  join public.push_devices pd on pd.id=c.device_id
  join public.profiles p on p.id=n.recipient_id and p.id=pd.user_id
  where p.approved and p.disabled_at is null and p.building_id=n.building_id
    and p.role in ('building_admin','owner','tenant')
    and (p.role='building_admin' or n.category not in ('payments','maintenance_tickets') or
      exists(select 1 from public.payments x where n.category='payments' and x.id=n.entity_id and x.apartment_id=p.apartment_id) or
      exists(select 1 from public.maintenance_tickets x where n.category='maintenance_tickets' and x.id=n.entity_id and x.apartment_id=p.apartment_id));
$function$
;

CREATE OR REPLACE FUNCTION public.publish_app_release(release_id text, title text, body text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare inserted integer;
begin
  insert into public.app_release_notices values(release_id,title,body,now()) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return 0; end if;
  insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,source_key)
  select p.id,p.building_id,'app_updates',publish_app_release.title,publish_app_release.body,'dashboard','home','release:'||release_id
  from public.profiles p where p.approved and p.disabled_at is null and p.building_id is not null
    and p.role in ('building_admin','owner','tenant') on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted;
end; $function$
;

CREATE OR REPLACE FUNCTION public.add_successor_manager(member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mine public.profiles;
begin
 select * into mine from public.profiles where id=auth.app_user_id();
 if mine.id is null or mine.role<>'building_admin' or not mine.approved or mine.disabled_at is not null or mine.building_id is null then raise exception 'Forbidden'; end if;
 perform 1 from public.buildings where id=mine.building_id for update;
 update public.profiles set role='building_admin' where id=member_id and id<>mine.id and building_id=mine.building_id and approved and disabled_at is null and role in ('owner','tenant');
 if not found then raise exception 'Member not eligible'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.manage_building_poll(p_poll_id uuid, p_remove boolean, p_question text, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare poll public.building_polls;
begin
  select * into poll from public.building_polls where id=p_poll_id for update;
  if auth.app_user_id() is null or poll.id is null or not public.can_manage_bunyan_building(poll.building_id) then raise exception 'Forbidden'; end if;
  if p_remove then
    delete from public.building_polls where id=p_poll_id;
  else
    if poll.status='closed' or poll.ends_at<=now() or exists(select 1 from public.building_poll_participation where poll_id=p_poll_id) then raise exception 'Voting has started'; end if;
    if length(btrim(p_question)) not between 5 and 300 or p_question is null or length(coalesce(p_description,''))>5000 then raise exception 'Invalid decision'; end if;
    update public.building_polls set question=btrim(p_question),description=coalesce(p_description,'') where id=p_poll_id;
  end if;
end; $function$
;

CREATE OR REPLACE FUNCTION public.schedule_daily_engagement()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare local_time timestamp:=now() at time zone 'Africa/Cairo'; slot_number integer; p record; msg public.engagement_messages; total integer:=0;
begin
  -- Never catch up missed slots or send outside the local 10/16/20 window.
  if extract(hour from local_time) not in (10,16,20) or extract(minute from local_time)>9 then return 0; end if;
  slot_number:=extract(hour from local_time);
  perform pg_advisory_xact_lock(818403);
  for p in select x.* from public.profiles x where x.approved and x.disabled_at is null and x.building_id is not null and x.role in ('building_admin','owner','tenant') and exists(select 1 from public.push_devices d where d.user_id=x.id)
  loop
    if exists(select 1 from public.engagement_history h where h.user_id=p.id and h.day=local_time::date and h.slot=slot_number) then continue; end if;
    select * into msg from public.engagement_messages m where not exists(select 1 from public.engagement_history h where h.user_id=p.id and h.message_id=m.id) order by md5(p.id::text||m.id) limit 1;
    if msg.id is null then continue; end if;
    insert into public.engagement_history values(p.id,msg.id,local_time::date,slot_number);
    insert into public.app_notifications(recipient_id,building_id,category,title,body,manager_target,member_target,source_key) values(p.id,p.building_id,'engagement',msg.title,msg.body,'dashboard','home','engagement:'||msg.id);
    total:=total+1;
  end loop;
  return total;
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_my_account(confirmation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid:=auth.app_user_id(); mine public.profiles;
begin
 if me is null or confirmation is distinct from 'حذف حسابي نهائيًا' then raise exception 'Confirmation required'; end if;
 if not exists(select 1 from auth.users where id=me) then raise exception 'Account not found'; end if;
 select * into mine from public.profiles where id=me;
 if mine.role='building_admin' and mine.building_id is not null then
   perform 1 from public.buildings where id=mine.building_id for update;
   if not exists(select 1 from public.profiles where building_id=mine.building_id and id<>me and role='building_admin' and approved and disabled_at is null) then raise exception 'LAST_MANAGER'; end if;
 end if;
 -- Personal requests and device/inbox data cascade; shared accounting remains.
 delete from public.building_invites where invited_by=me;
 delete from public.building_access_codes where created_by=me;
 delete from auth.users where id=me;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_building_location(target_building_id uuid, new_latitude double precision, new_longitude double precision)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.app_user_id() is null then raise exception 'Authentication required'; end if;
 if new_latitude is null or new_longitude is null or new_latitude not between -90 and 90 or new_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
 if not exists(select 1 from public.profiles where id=auth.app_user_id() and building_id=target_building_id and role='manager') then raise exception 'Access denied'; end if;
 update public.buildings set latitude=new_latitude,longitude=new_longitude where id=target_building_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.delete_payment_with_treasury(payment_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt public.payments; result numeric;
begin
 select * into receipt from public.payments where id=payment_id for update;
 if receipt.id is null then raise exception 'Payment not found'; end if;
 if auth.app_user_id() is null or not public.can_manage_bunyan_building(receipt.building_id) then raise exception 'Forbidden'; end if;
 update public.buildings set balance=balance-receipt.amount where id=receipt.building_id returning balance into result;
 delete from public.payments where id=receipt.id;
 return result;
end $function$
;
ALTER TABLE public."building_poll_participation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_poll_participation" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_poll_ballots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_poll_ballots" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_polls" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_polls" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_poll_options" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_poll_options" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_treasury_settings_audit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_treasury_settings_audit" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."notification_deliveries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."notification_deliveries" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."app_release_notices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."app_release_notices" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."app_notifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."app_notifications" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_invites" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_invites" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."payments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."payments" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."profiles" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."apartments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."apartments" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."maintenance_tickets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."maintenance_tickets" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."facility_bookings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."facility_bookings" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."payment_audit_logs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."payment_audit_logs" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."engagement_messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."engagement_messages" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."engagement_history" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."engagement_history" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."push_devices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."push_devices" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."buildings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."buildings" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."app_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."app_settings" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."expenses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."expenses" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."announcements" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."exceptional_collections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."exceptional_collections" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_access_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_access_codes" FROM PUBLIC, authenticated, anon;
ALTER TABLE public."building_join_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."building_join_requests" FROM PUBLIC, authenticated, anon;
CREATE POLICY "Users can read their own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = ( SELECT auth.app_user_id() AS uid)));
CREATE POLICY "buildings_admin_select" ON public."buildings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(id));
CREATE POLICY "buildings_admin_update" ON public."buildings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(id)) WITH CHECK (can_manage_bunyan_building(id));
CREATE POLICY "apartments_admin_select" ON public."apartments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "apartments_admin_insert" ON public."apartments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "apartments_admin_update" ON public."apartments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "apartments_admin_delete" ON public."apartments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "payments_admin_select" ON public."payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "payments_admin_insert" ON public."payments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "payments_admin_update" ON public."payments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "payments_admin_delete" ON public."payments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "expenses_admin_select" ON public."expenses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "expenses_admin_insert" ON public."expenses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "expenses_admin_update" ON public."expenses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "expenses_admin_delete" ON public."expenses" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "payment_audit_logs_admin_select" ON public."payment_audit_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "payment_audit_logs_admin_insert" ON public."payment_audit_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "payment_audit_logs_admin_update" ON public."payment_audit_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "payment_audit_logs_admin_delete" ON public."payment_audit_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "maintenance_tickets_admin_select" ON public."maintenance_tickets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "maintenance_tickets_admin_insert" ON public."maintenance_tickets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "maintenance_tickets_admin_update" ON public."maintenance_tickets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "maintenance_tickets_admin_delete" ON public."maintenance_tickets" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "facility_bookings_admin_select" ON public."facility_bookings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "facility_bookings_admin_insert" ON public."facility_bookings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "facility_bookings_admin_update" ON public."facility_bookings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "facility_bookings_admin_delete" ON public."facility_bookings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "announcements_admin_select" ON public."announcements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "announcements_admin_insert" ON public."announcements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "announcements_admin_update" ON public."announcements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "announcements_admin_delete" ON public."announcements" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "app_settings_admin_select" ON public."app_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "app_settings_admin_insert" ON public."app_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "app_settings_admin_update" ON public."app_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "app_settings_admin_delete" ON public."app_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "exceptional_collections_admin_insert" ON public."exceptional_collections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((can_manage_bunyan_building(building_id) AND (created_by = auth.app_user_id())));
CREATE POLICY "Users can view their own push devices" ON public."push_devices" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((auth.app_user_id() = user_id));
CREATE POLICY "Users can register their own push devices" ON public."push_devices" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((auth.app_user_id() = user_id));
CREATE POLICY "Users can update their own push devices" ON public."push_devices" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((auth.app_user_id() = user_id)) WITH CHECK ((auth.app_user_id() = user_id));
CREATE POLICY "Users can remove their own push devices" ON public."push_devices" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((auth.app_user_id() = user_id));
CREATE POLICY "exceptional_collections_admin_select" ON public."exceptional_collections" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "exceptional_collections_admin_update" ON public."exceptional_collections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (can_manage_bunyan_building(building_id)) WITH CHECK (can_manage_bunyan_building(building_id));
CREATE POLICY "exceptional_collections_admin_delete" ON public."exceptional_collections" AS PERMISSIVE FOR DELETE TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "profiles_admin_read" ON public."profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((id = ( SELECT auth.app_user_id() AS uid)) OR can_manage_bunyan_building(building_id)));
CREATE POLICY "building_access_codes_manager_read" ON public."building_access_codes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "building_join_requests_manager_read" ON public."building_join_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "building_join_requests_own_read" ON public."building_join_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = ( SELECT auth.app_user_id() AS uid)));
CREATE POLICY "announcements_resident_select" ON public."announcements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((building_id = ( SELECT p.building_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))));
CREATE POLICY "apartments_resident_select" ON public."apartments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = ( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))));
CREATE POLICY "buildings_resident_select" ON public."buildings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = ( SELECT p.building_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))));
CREATE POLICY "exceptional_collections_resident_select" ON public."exceptional_collections" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((target_apartment_ids @> ARRAY[( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['owner'::text, 'tenant'::text]))))]));
CREATE POLICY "facility_bookings_resident_insert" ON public."facility_bookings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = ( SELECT auth.app_user_id() AS uid)) AND (apartment_id = ( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))) AND (building_id = ( SELECT p.building_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text])))))));
CREATE POLICY "facility_bookings_resident_select" ON public."facility_bookings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((apartment_id = ( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))));
CREATE POLICY "maintenance_tickets_resident_insert" ON public."maintenance_tickets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = ( SELECT auth.app_user_id() AS uid)) AND (apartment_id = ( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))) AND (building_id = ( SELECT p.building_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text])))))));
CREATE POLICY "maintenance_tickets_resident_select" ON public."maintenance_tickets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((apartment_id = ( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))));
CREATE POLICY "payments_resident_select" ON public."payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((apartment_id = ( SELECT p.apartment_id
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['tenant'::text, 'owner'::text]))))));
CREATE POLICY "building_polls_select_same_building" ON public."building_polls" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((can_manage_bunyan_building(building_id) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND (p.building_id = building_polls.building_id) AND (p.approved = true) AND (p.disabled_at IS NULL) AND (p.role = ANY (ARRAY['owner'::text, 'tenant'::text])) AND (p.apartment_id IS NOT NULL))))));
CREATE POLICY "building_poll_options_select_same_building" ON public."building_poll_options" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM building_polls p
  WHERE ((p.id = building_poll_options.poll_id) AND (can_manage_bunyan_building(p.building_id) OR (EXISTS ( SELECT 1
           FROM profiles resident
          WHERE ((resident.id = ( SELECT auth.app_user_id() AS uid)) AND (resident.building_id = p.building_id) AND (resident.approved = true) AND (resident.disabled_at IS NULL) AND (resident.role = ANY (ARRAY['owner'::text, 'tenant'::text])) AND (resident.apartment_id IS NOT NULL)))))))));
CREATE POLICY "treasury_settings_audit_manager_read" ON public."building_treasury_settings_audit" AS PERMISSIVE FOR SELECT TO "authenticated" USING (can_manage_bunyan_building(building_id));
CREATE POLICY "app_notifications_own_read" ON public."app_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((recipient_id = ( SELECT auth.app_user_id() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND p.approved AND (p.disabled_at IS NULL) AND (p.building_id = app_notifications.building_id))))));
CREATE POLICY "app_notifications_own_mark_read" ON public."app_notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((recipient_id = ( SELECT auth.app_user_id() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND p.approved AND (p.disabled_at IS NULL) AND (p.building_id = app_notifications.building_id)))))) WITH CHECK (((recipient_id = ( SELECT auth.app_user_id() AS uid)) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = ( SELECT auth.app_user_id() AS uid)) AND p.approved AND (p.disabled_at IS NULL) AND (p.building_id = app_notifications.building_id))))));
GRANT INSERT ON public."building_poll_participation" TO "service_role";
GRANT SELECT ON public."building_poll_participation" TO "service_role";
GRANT UPDATE ON public."building_poll_participation" TO "service_role";
GRANT DELETE ON public."building_poll_participation" TO "service_role";
GRANT TRUNCATE ON public."building_poll_participation" TO "service_role";
GRANT REFERENCES ON public."building_poll_participation" TO "service_role";
GRANT TRIGGER ON public."building_poll_participation" TO "service_role";
GRANT INSERT ON public."building_poll_ballots" TO "service_role";
GRANT SELECT ON public."building_poll_ballots" TO "service_role";
GRANT UPDATE ON public."building_poll_ballots" TO "service_role";
GRANT DELETE ON public."building_poll_ballots" TO "service_role";
GRANT TRUNCATE ON public."building_poll_ballots" TO "service_role";
GRANT REFERENCES ON public."building_poll_ballots" TO "service_role";
GRANT TRIGGER ON public."building_poll_ballots" TO "service_role";
GRANT INSERT ON public."building_polls" TO "anon";
GRANT SELECT ON public."building_polls" TO "anon";
GRANT UPDATE ON public."building_polls" TO "anon";
GRANT DELETE ON public."building_polls" TO "anon";
GRANT TRUNCATE ON public."building_polls" TO "anon";
GRANT REFERENCES ON public."building_polls" TO "anon";
GRANT TRIGGER ON public."building_polls" TO "anon";
GRANT INSERT ON public."building_polls" TO "authenticated";
GRANT SELECT ON public."building_polls" TO "authenticated";
GRANT UPDATE ON public."building_polls" TO "authenticated";
GRANT DELETE ON public."building_polls" TO "authenticated";
GRANT TRUNCATE ON public."building_polls" TO "authenticated";
GRANT REFERENCES ON public."building_polls" TO "authenticated";
GRANT TRIGGER ON public."building_polls" TO "authenticated";
GRANT INSERT ON public."building_polls" TO "service_role";
GRANT SELECT ON public."building_polls" TO "service_role";
GRANT UPDATE ON public."building_polls" TO "service_role";
GRANT DELETE ON public."building_polls" TO "service_role";
GRANT TRUNCATE ON public."building_polls" TO "service_role";
GRANT REFERENCES ON public."building_polls" TO "service_role";
GRANT TRIGGER ON public."building_polls" TO "service_role";
GRANT INSERT ON public."building_poll_options" TO "anon";
GRANT SELECT ON public."building_poll_options" TO "anon";
GRANT UPDATE ON public."building_poll_options" TO "anon";
GRANT DELETE ON public."building_poll_options" TO "anon";
GRANT TRUNCATE ON public."building_poll_options" TO "anon";
GRANT REFERENCES ON public."building_poll_options" TO "anon";
GRANT TRIGGER ON public."building_poll_options" TO "anon";
GRANT INSERT ON public."building_poll_options" TO "authenticated";
GRANT SELECT ON public."building_poll_options" TO "authenticated";
GRANT UPDATE ON public."building_poll_options" TO "authenticated";
GRANT DELETE ON public."building_poll_options" TO "authenticated";
GRANT TRUNCATE ON public."building_poll_options" TO "authenticated";
GRANT REFERENCES ON public."building_poll_options" TO "authenticated";
GRANT TRIGGER ON public."building_poll_options" TO "authenticated";
GRANT INSERT ON public."building_poll_options" TO "service_role";
GRANT SELECT ON public."building_poll_options" TO "service_role";
GRANT UPDATE ON public."building_poll_options" TO "service_role";
GRANT DELETE ON public."building_poll_options" TO "service_role";
GRANT TRUNCATE ON public."building_poll_options" TO "service_role";
GRANT REFERENCES ON public."building_poll_options" TO "service_role";
GRANT TRIGGER ON public."building_poll_options" TO "service_role";
GRANT INSERT ON public."building_treasury_settings_audit" TO "service_role";
GRANT SELECT ON public."building_treasury_settings_audit" TO "service_role";
GRANT UPDATE ON public."building_treasury_settings_audit" TO "service_role";
GRANT DELETE ON public."building_treasury_settings_audit" TO "service_role";
GRANT TRUNCATE ON public."building_treasury_settings_audit" TO "service_role";
GRANT REFERENCES ON public."building_treasury_settings_audit" TO "service_role";
GRANT TRIGGER ON public."building_treasury_settings_audit" TO "service_role";
GRANT SELECT ON public."building_treasury_settings_audit" TO "authenticated";
GRANT INSERT ON public."notification_deliveries" TO "service_role";
GRANT SELECT ON public."notification_deliveries" TO "service_role";
GRANT UPDATE ON public."notification_deliveries" TO "service_role";
GRANT DELETE ON public."notification_deliveries" TO "service_role";
GRANT TRUNCATE ON public."notification_deliveries" TO "service_role";
GRANT REFERENCES ON public."notification_deliveries" TO "service_role";
GRANT TRIGGER ON public."notification_deliveries" TO "service_role";
GRANT INSERT ON public."app_release_notices" TO "service_role";
GRANT SELECT ON public."app_release_notices" TO "service_role";
GRANT UPDATE ON public."app_release_notices" TO "service_role";
GRANT DELETE ON public."app_release_notices" TO "service_role";
GRANT TRUNCATE ON public."app_release_notices" TO "service_role";
GRANT REFERENCES ON public."app_release_notices" TO "service_role";
GRANT TRIGGER ON public."app_release_notices" TO "service_role";
GRANT INSERT ON public."app_notifications" TO "service_role";
GRANT SELECT ON public."app_notifications" TO "service_role";
GRANT UPDATE ON public."app_notifications" TO "service_role";
GRANT DELETE ON public."app_notifications" TO "service_role";
GRANT TRUNCATE ON public."app_notifications" TO "service_role";
GRANT REFERENCES ON public."app_notifications" TO "service_role";
GRANT TRIGGER ON public."app_notifications" TO "service_role";
GRANT SELECT ON public."app_notifications" TO "authenticated";
GRANT INSERT ON public."building_invites" TO "service_role";
GRANT SELECT ON public."building_invites" TO "service_role";
GRANT UPDATE ON public."building_invites" TO "service_role";
GRANT DELETE ON public."building_invites" TO "service_role";
GRANT TRUNCATE ON public."building_invites" TO "service_role";
GRANT REFERENCES ON public."building_invites" TO "service_role";
GRANT TRIGGER ON public."building_invites" TO "service_role";
GRANT INSERT ON public."payments" TO "anon";
GRANT SELECT ON public."payments" TO "anon";
GRANT UPDATE ON public."payments" TO "anon";
GRANT DELETE ON public."payments" TO "anon";
GRANT TRUNCATE ON public."payments" TO "anon";
GRANT REFERENCES ON public."payments" TO "anon";
GRANT TRIGGER ON public."payments" TO "anon";
GRANT INSERT ON public."payments" TO "authenticated";
GRANT SELECT ON public."payments" TO "authenticated";
GRANT UPDATE ON public."payments" TO "authenticated";
GRANT DELETE ON public."payments" TO "authenticated";
GRANT TRUNCATE ON public."payments" TO "authenticated";
GRANT REFERENCES ON public."payments" TO "authenticated";
GRANT TRIGGER ON public."payments" TO "authenticated";
GRANT INSERT ON public."payments" TO "service_role";
GRANT SELECT ON public."payments" TO "service_role";
GRANT UPDATE ON public."payments" TO "service_role";
GRANT DELETE ON public."payments" TO "service_role";
GRANT TRUNCATE ON public."payments" TO "service_role";
GRANT REFERENCES ON public."payments" TO "service_role";
GRANT TRIGGER ON public."payments" TO "service_role";
GRANT INSERT ON public."profiles" TO "anon";
GRANT SELECT ON public."profiles" TO "anon";
GRANT UPDATE ON public."profiles" TO "anon";
GRANT DELETE ON public."profiles" TO "anon";
GRANT TRUNCATE ON public."profiles" TO "anon";
GRANT REFERENCES ON public."profiles" TO "anon";
GRANT TRIGGER ON public."profiles" TO "anon";
GRANT INSERT ON public."profiles" TO "authenticated";
GRANT SELECT ON public."profiles" TO "authenticated";
GRANT UPDATE ON public."profiles" TO "authenticated";
GRANT DELETE ON public."profiles" TO "authenticated";
GRANT TRUNCATE ON public."profiles" TO "authenticated";
GRANT REFERENCES ON public."profiles" TO "authenticated";
GRANT TRIGGER ON public."profiles" TO "authenticated";
GRANT INSERT ON public."profiles" TO "service_role";
GRANT SELECT ON public."profiles" TO "service_role";
GRANT UPDATE ON public."profiles" TO "service_role";
GRANT DELETE ON public."profiles" TO "service_role";
GRANT TRUNCATE ON public."profiles" TO "service_role";
GRANT REFERENCES ON public."profiles" TO "service_role";
GRANT TRIGGER ON public."profiles" TO "service_role";
GRANT INSERT ON public."apartments" TO "anon";
GRANT SELECT ON public."apartments" TO "anon";
GRANT UPDATE ON public."apartments" TO "anon";
GRANT DELETE ON public."apartments" TO "anon";
GRANT TRUNCATE ON public."apartments" TO "anon";
GRANT REFERENCES ON public."apartments" TO "anon";
GRANT TRIGGER ON public."apartments" TO "anon";
GRANT INSERT ON public."apartments" TO "authenticated";
GRANT SELECT ON public."apartments" TO "authenticated";
GRANT UPDATE ON public."apartments" TO "authenticated";
GRANT DELETE ON public."apartments" TO "authenticated";
GRANT TRUNCATE ON public."apartments" TO "authenticated";
GRANT REFERENCES ON public."apartments" TO "authenticated";
GRANT TRIGGER ON public."apartments" TO "authenticated";
GRANT INSERT ON public."apartments" TO "service_role";
GRANT SELECT ON public."apartments" TO "service_role";
GRANT UPDATE ON public."apartments" TO "service_role";
GRANT DELETE ON public."apartments" TO "service_role";
GRANT TRUNCATE ON public."apartments" TO "service_role";
GRANT REFERENCES ON public."apartments" TO "service_role";
GRANT TRIGGER ON public."apartments" TO "service_role";
GRANT INSERT ON public."maintenance_tickets" TO "anon";
GRANT SELECT ON public."maintenance_tickets" TO "anon";
GRANT UPDATE ON public."maintenance_tickets" TO "anon";
GRANT DELETE ON public."maintenance_tickets" TO "anon";
GRANT TRUNCATE ON public."maintenance_tickets" TO "anon";
GRANT REFERENCES ON public."maintenance_tickets" TO "anon";
GRANT TRIGGER ON public."maintenance_tickets" TO "anon";
GRANT INSERT ON public."maintenance_tickets" TO "authenticated";
GRANT SELECT ON public."maintenance_tickets" TO "authenticated";
GRANT UPDATE ON public."maintenance_tickets" TO "authenticated";
GRANT DELETE ON public."maintenance_tickets" TO "authenticated";
GRANT TRUNCATE ON public."maintenance_tickets" TO "authenticated";
GRANT REFERENCES ON public."maintenance_tickets" TO "authenticated";
GRANT TRIGGER ON public."maintenance_tickets" TO "authenticated";
GRANT INSERT ON public."maintenance_tickets" TO "service_role";
GRANT SELECT ON public."maintenance_tickets" TO "service_role";
GRANT UPDATE ON public."maintenance_tickets" TO "service_role";
GRANT DELETE ON public."maintenance_tickets" TO "service_role";
GRANT TRUNCATE ON public."maintenance_tickets" TO "service_role";
GRANT REFERENCES ON public."maintenance_tickets" TO "service_role";
GRANT TRIGGER ON public."maintenance_tickets" TO "service_role";
GRANT INSERT ON public."facility_bookings" TO "anon";
GRANT SELECT ON public."facility_bookings" TO "anon";
GRANT UPDATE ON public."facility_bookings" TO "anon";
GRANT DELETE ON public."facility_bookings" TO "anon";
GRANT TRUNCATE ON public."facility_bookings" TO "anon";
GRANT REFERENCES ON public."facility_bookings" TO "anon";
GRANT TRIGGER ON public."facility_bookings" TO "anon";
GRANT INSERT ON public."facility_bookings" TO "authenticated";
GRANT SELECT ON public."facility_bookings" TO "authenticated";
GRANT UPDATE ON public."facility_bookings" TO "authenticated";
GRANT DELETE ON public."facility_bookings" TO "authenticated";
GRANT TRUNCATE ON public."facility_bookings" TO "authenticated";
GRANT REFERENCES ON public."facility_bookings" TO "authenticated";
GRANT TRIGGER ON public."facility_bookings" TO "authenticated";
GRANT INSERT ON public."facility_bookings" TO "service_role";
GRANT SELECT ON public."facility_bookings" TO "service_role";
GRANT UPDATE ON public."facility_bookings" TO "service_role";
GRANT DELETE ON public."facility_bookings" TO "service_role";
GRANT TRUNCATE ON public."facility_bookings" TO "service_role";
GRANT REFERENCES ON public."facility_bookings" TO "service_role";
GRANT TRIGGER ON public."facility_bookings" TO "service_role";
GRANT INSERT ON public."payment_audit_logs" TO "anon";
GRANT SELECT ON public."payment_audit_logs" TO "anon";
GRANT UPDATE ON public."payment_audit_logs" TO "anon";
GRANT DELETE ON public."payment_audit_logs" TO "anon";
GRANT TRUNCATE ON public."payment_audit_logs" TO "anon";
GRANT REFERENCES ON public."payment_audit_logs" TO "anon";
GRANT TRIGGER ON public."payment_audit_logs" TO "anon";
GRANT INSERT ON public."payment_audit_logs" TO "authenticated";
GRANT SELECT ON public."payment_audit_logs" TO "authenticated";
GRANT UPDATE ON public."payment_audit_logs" TO "authenticated";
GRANT DELETE ON public."payment_audit_logs" TO "authenticated";
GRANT TRUNCATE ON public."payment_audit_logs" TO "authenticated";
GRANT REFERENCES ON public."payment_audit_logs" TO "authenticated";
GRANT TRIGGER ON public."payment_audit_logs" TO "authenticated";
GRANT INSERT ON public."payment_audit_logs" TO "service_role";
GRANT SELECT ON public."payment_audit_logs" TO "service_role";
GRANT UPDATE ON public."payment_audit_logs" TO "service_role";
GRANT DELETE ON public."payment_audit_logs" TO "service_role";
GRANT TRUNCATE ON public."payment_audit_logs" TO "service_role";
GRANT REFERENCES ON public."payment_audit_logs" TO "service_role";
GRANT TRIGGER ON public."payment_audit_logs" TO "service_role";
GRANT INSERT ON public."engagement_messages" TO "service_role";
GRANT SELECT ON public."engagement_messages" TO "service_role";
GRANT UPDATE ON public."engagement_messages" TO "service_role";
GRANT DELETE ON public."engagement_messages" TO "service_role";
GRANT TRUNCATE ON public."engagement_messages" TO "service_role";
GRANT REFERENCES ON public."engagement_messages" TO "service_role";
GRANT TRIGGER ON public."engagement_messages" TO "service_role";
GRANT INSERT ON public."engagement_history" TO "service_role";
GRANT SELECT ON public."engagement_history" TO "service_role";
GRANT UPDATE ON public."engagement_history" TO "service_role";
GRANT DELETE ON public."engagement_history" TO "service_role";
GRANT TRUNCATE ON public."engagement_history" TO "service_role";
GRANT REFERENCES ON public."engagement_history" TO "service_role";
GRANT TRIGGER ON public."engagement_history" TO "service_role";
GRANT INSERT ON public."push_devices" TO "anon";
GRANT SELECT ON public."push_devices" TO "anon";
GRANT UPDATE ON public."push_devices" TO "anon";
GRANT DELETE ON public."push_devices" TO "anon";
GRANT TRUNCATE ON public."push_devices" TO "anon";
GRANT REFERENCES ON public."push_devices" TO "anon";
GRANT TRIGGER ON public."push_devices" TO "anon";
GRANT INSERT ON public."push_devices" TO "authenticated";
GRANT SELECT ON public."push_devices" TO "authenticated";
GRANT UPDATE ON public."push_devices" TO "authenticated";
GRANT DELETE ON public."push_devices" TO "authenticated";
GRANT TRUNCATE ON public."push_devices" TO "authenticated";
GRANT REFERENCES ON public."push_devices" TO "authenticated";
GRANT TRIGGER ON public."push_devices" TO "authenticated";
GRANT INSERT ON public."push_devices" TO "service_role";
GRANT SELECT ON public."push_devices" TO "service_role";
GRANT UPDATE ON public."push_devices" TO "service_role";
GRANT DELETE ON public."push_devices" TO "service_role";
GRANT TRUNCATE ON public."push_devices" TO "service_role";
GRANT REFERENCES ON public."push_devices" TO "service_role";
GRANT TRIGGER ON public."push_devices" TO "service_role";
GRANT INSERT ON public."buildings" TO "anon";
GRANT SELECT ON public."buildings" TO "anon";
GRANT UPDATE ON public."buildings" TO "anon";
GRANT DELETE ON public."buildings" TO "anon";
GRANT TRUNCATE ON public."buildings" TO "anon";
GRANT REFERENCES ON public."buildings" TO "anon";
GRANT TRIGGER ON public."buildings" TO "anon";
GRANT INSERT ON public."buildings" TO "authenticated";
GRANT SELECT ON public."buildings" TO "authenticated";
GRANT UPDATE ON public."buildings" TO "authenticated";
GRANT DELETE ON public."buildings" TO "authenticated";
GRANT TRUNCATE ON public."buildings" TO "authenticated";
GRANT REFERENCES ON public."buildings" TO "authenticated";
GRANT TRIGGER ON public."buildings" TO "authenticated";
GRANT INSERT ON public."buildings" TO "service_role";
GRANT SELECT ON public."buildings" TO "service_role";
GRANT UPDATE ON public."buildings" TO "service_role";
GRANT DELETE ON public."buildings" TO "service_role";
GRANT TRUNCATE ON public."buildings" TO "service_role";
GRANT REFERENCES ON public."buildings" TO "service_role";
GRANT TRIGGER ON public."buildings" TO "service_role";
GRANT INSERT ON public."app_settings" TO "anon";
GRANT SELECT ON public."app_settings" TO "anon";
GRANT UPDATE ON public."app_settings" TO "anon";
GRANT DELETE ON public."app_settings" TO "anon";
GRANT TRUNCATE ON public."app_settings" TO "anon";
GRANT REFERENCES ON public."app_settings" TO "anon";
GRANT TRIGGER ON public."app_settings" TO "anon";
GRANT INSERT ON public."app_settings" TO "authenticated";
GRANT SELECT ON public."app_settings" TO "authenticated";
GRANT UPDATE ON public."app_settings" TO "authenticated";
GRANT DELETE ON public."app_settings" TO "authenticated";
GRANT TRUNCATE ON public."app_settings" TO "authenticated";
GRANT REFERENCES ON public."app_settings" TO "authenticated";
GRANT TRIGGER ON public."app_settings" TO "authenticated";
GRANT INSERT ON public."app_settings" TO "service_role";
GRANT SELECT ON public."app_settings" TO "service_role";
GRANT UPDATE ON public."app_settings" TO "service_role";
GRANT DELETE ON public."app_settings" TO "service_role";
GRANT TRUNCATE ON public."app_settings" TO "service_role";
GRANT REFERENCES ON public."app_settings" TO "service_role";
GRANT TRIGGER ON public."app_settings" TO "service_role";
GRANT INSERT ON public."expenses" TO "anon";
GRANT SELECT ON public."expenses" TO "anon";
GRANT UPDATE ON public."expenses" TO "anon";
GRANT DELETE ON public."expenses" TO "anon";
GRANT TRUNCATE ON public."expenses" TO "anon";
GRANT REFERENCES ON public."expenses" TO "anon";
GRANT TRIGGER ON public."expenses" TO "anon";
GRANT INSERT ON public."expenses" TO "authenticated";
GRANT SELECT ON public."expenses" TO "authenticated";
GRANT UPDATE ON public."expenses" TO "authenticated";
GRANT DELETE ON public."expenses" TO "authenticated";
GRANT TRUNCATE ON public."expenses" TO "authenticated";
GRANT REFERENCES ON public."expenses" TO "authenticated";
GRANT TRIGGER ON public."expenses" TO "authenticated";
GRANT INSERT ON public."expenses" TO "service_role";
GRANT SELECT ON public."expenses" TO "service_role";
GRANT UPDATE ON public."expenses" TO "service_role";
GRANT DELETE ON public."expenses" TO "service_role";
GRANT TRUNCATE ON public."expenses" TO "service_role";
GRANT REFERENCES ON public."expenses" TO "service_role";
GRANT TRIGGER ON public."expenses" TO "service_role";
GRANT INSERT ON public."announcements" TO "anon";
GRANT SELECT ON public."announcements" TO "anon";
GRANT UPDATE ON public."announcements" TO "anon";
GRANT DELETE ON public."announcements" TO "anon";
GRANT TRUNCATE ON public."announcements" TO "anon";
GRANT REFERENCES ON public."announcements" TO "anon";
GRANT TRIGGER ON public."announcements" TO "anon";
GRANT INSERT ON public."announcements" TO "authenticated";
GRANT SELECT ON public."announcements" TO "authenticated";
GRANT UPDATE ON public."announcements" TO "authenticated";
GRANT DELETE ON public."announcements" TO "authenticated";
GRANT TRUNCATE ON public."announcements" TO "authenticated";
GRANT REFERENCES ON public."announcements" TO "authenticated";
GRANT TRIGGER ON public."announcements" TO "authenticated";
GRANT INSERT ON public."announcements" TO "service_role";
GRANT SELECT ON public."announcements" TO "service_role";
GRANT UPDATE ON public."announcements" TO "service_role";
GRANT DELETE ON public."announcements" TO "service_role";
GRANT TRUNCATE ON public."announcements" TO "service_role";
GRANT REFERENCES ON public."announcements" TO "service_role";
GRANT TRIGGER ON public."announcements" TO "service_role";
GRANT INSERT ON public."exceptional_collections" TO "anon";
GRANT SELECT ON public."exceptional_collections" TO "anon";
GRANT UPDATE ON public."exceptional_collections" TO "anon";
GRANT DELETE ON public."exceptional_collections" TO "anon";
GRANT TRUNCATE ON public."exceptional_collections" TO "anon";
GRANT REFERENCES ON public."exceptional_collections" TO "anon";
GRANT TRIGGER ON public."exceptional_collections" TO "anon";
GRANT INSERT ON public."exceptional_collections" TO "authenticated";
GRANT SELECT ON public."exceptional_collections" TO "authenticated";
GRANT UPDATE ON public."exceptional_collections" TO "authenticated";
GRANT DELETE ON public."exceptional_collections" TO "authenticated";
GRANT TRUNCATE ON public."exceptional_collections" TO "authenticated";
GRANT REFERENCES ON public."exceptional_collections" TO "authenticated";
GRANT TRIGGER ON public."exceptional_collections" TO "authenticated";
GRANT INSERT ON public."exceptional_collections" TO "service_role";
GRANT SELECT ON public."exceptional_collections" TO "service_role";
GRANT UPDATE ON public."exceptional_collections" TO "service_role";
GRANT DELETE ON public."exceptional_collections" TO "service_role";
GRANT TRUNCATE ON public."exceptional_collections" TO "service_role";
GRANT REFERENCES ON public."exceptional_collections" TO "service_role";
GRANT TRIGGER ON public."exceptional_collections" TO "service_role";
GRANT INSERT ON public."building_access_codes" TO "anon";
GRANT SELECT ON public."building_access_codes" TO "anon";
GRANT UPDATE ON public."building_access_codes" TO "anon";
GRANT DELETE ON public."building_access_codes" TO "anon";
GRANT TRUNCATE ON public."building_access_codes" TO "anon";
GRANT REFERENCES ON public."building_access_codes" TO "anon";
GRANT TRIGGER ON public."building_access_codes" TO "anon";
GRANT INSERT ON public."building_access_codes" TO "authenticated";
GRANT SELECT ON public."building_access_codes" TO "authenticated";
GRANT UPDATE ON public."building_access_codes" TO "authenticated";
GRANT DELETE ON public."building_access_codes" TO "authenticated";
GRANT TRUNCATE ON public."building_access_codes" TO "authenticated";
GRANT REFERENCES ON public."building_access_codes" TO "authenticated";
GRANT TRIGGER ON public."building_access_codes" TO "authenticated";
GRANT INSERT ON public."building_access_codes" TO "service_role";
GRANT SELECT ON public."building_access_codes" TO "service_role";
GRANT UPDATE ON public."building_access_codes" TO "service_role";
GRANT DELETE ON public."building_access_codes" TO "service_role";
GRANT TRUNCATE ON public."building_access_codes" TO "service_role";
GRANT REFERENCES ON public."building_access_codes" TO "service_role";
GRANT TRIGGER ON public."building_access_codes" TO "service_role";
GRANT INSERT ON public."building_join_requests" TO "anon";
GRANT SELECT ON public."building_join_requests" TO "anon";
GRANT UPDATE ON public."building_join_requests" TO "anon";
GRANT DELETE ON public."building_join_requests" TO "anon";
GRANT TRUNCATE ON public."building_join_requests" TO "anon";
GRANT REFERENCES ON public."building_join_requests" TO "anon";
GRANT TRIGGER ON public."building_join_requests" TO "anon";
GRANT INSERT ON public."building_join_requests" TO "authenticated";
GRANT SELECT ON public."building_join_requests" TO "authenticated";
GRANT UPDATE ON public."building_join_requests" TO "authenticated";
GRANT DELETE ON public."building_join_requests" TO "authenticated";
GRANT TRUNCATE ON public."building_join_requests" TO "authenticated";
GRANT REFERENCES ON public."building_join_requests" TO "authenticated";
GRANT TRIGGER ON public."building_join_requests" TO "authenticated";
GRANT INSERT ON public."building_join_requests" TO "service_role";
GRANT SELECT ON public."building_join_requests" TO "service_role";
GRANT UPDATE ON public."building_join_requests" TO "service_role";
GRANT DELETE ON public."building_join_requests" TO "service_role";
GRANT TRUNCATE ON public."building_join_requests" TO "service_role";
GRANT REFERENCES ON public."building_join_requests" TO "service_role";
GRANT TRIGGER ON public."building_join_requests" TO "service_role";
REVOKE ALL ON FUNCTION public."revoke_building_access_code"(target_building_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."revoke_building_access_code"(target_building_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."revoke_building_access_code"(target_building_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."handle_new_auth_user"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."handle_new_auth_user"() TO "service_role";
REVOKE ALL ON FUNCTION public."can_manage_bunyan_building"(target_building_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."can_manage_bunyan_building"(target_building_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."can_manage_bunyan_building"(target_building_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."is_active_bunyan_admin"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."is_active_bunyan_admin"() TO "service_role";
REVOKE ALL ON FUNCTION public."approve_registration"(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."approve_registration"(target_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."list_pending_registrations"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."list_pending_registrations"() TO "service_role";
REVOKE ALL ON FUNCTION public."set_bunyan_user_role"(target_user_id uuid, target_role text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."set_bunyan_user_role"(target_user_id uuid, target_role text) TO "service_role";
REVOKE ALL ON FUNCTION public."reject_building_join_request"(target_request_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."reject_building_join_request"(target_request_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."reject_building_join_request"(target_request_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."bootstrap_first_super_admin"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."bootstrap_first_super_admin"() TO "service_role";
REVOKE ALL ON FUNCTION public."approve_registration_as_super_admin"(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."approve_registration_as_super_admin"(target_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."disable_bunyan_user"(target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."disable_bunyan_user"(target_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."list_resident_access_requests"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."list_resident_access_requests"() TO "service_role";
REVOKE ALL ON FUNCTION public."normalize_egyptian_phone"(p_phone text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."normalize_egyptian_phone"(p_phone text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."normalize_egyptian_phone"(p_phone text) TO "service_role";
REVOKE ALL ON FUNCTION public."create_building_invite"(target_building_id uuid, target_apartment_id uuid, target_email text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_building_invite"(target_building_id uuid, target_apartment_id uuid, target_email text) TO "service_role";
REVOKE ALL ON FUNCTION public."list_all_bunyan_users"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."list_all_bunyan_users"() TO "service_role";
REVOKE ALL ON FUNCTION public."create_building_phone_invite"(target_building_id uuid, target_apartment_id uuid, target_phone text, target_name text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_building_phone_invite"(target_building_id uuid, target_apartment_id uuid, target_phone text, target_name text) TO "service_role";
REVOKE ALL ON FUNCTION public."create_building_for_current_user"(building_name text, building_address text, units_count integer, floors_count integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_building_for_current_user"(building_name text, building_address text, units_count integer, floors_count integer) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_building_for_current_user"(building_name text, building_address text, units_count integer, floors_count integer) TO "service_role";
REVOKE ALL ON FUNCTION public."accept_building_phone_invite"(target_invite_code text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."accept_building_phone_invite"(target_invite_code text) TO "service_role";
REVOKE ALL ON FUNCTION public."list_building_users"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."list_building_users"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."list_building_users"() TO "service_role";
REVOKE ALL ON FUNCTION public."create_or_rotate_building_access_code"(target_building_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_or_rotate_building_access_code"(target_building_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_or_rotate_building_access_code"(target_building_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."approve_and_assign_registration"(target_user_id uuid, target_apartment_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."approve_and_assign_registration"(target_user_id uuid, target_apartment_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."accept_building_invite"(target_invite_code uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."accept_building_invite"(target_invite_code uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."cast_building_poll_vote"(p_poll_id uuid, p_option_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."cast_building_poll_vote"(p_poll_id uuid, p_option_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."cast_building_poll_vote"(p_poll_id uuid, p_option_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."get_building_financial_summary"(p_building_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."get_building_financial_summary"(p_building_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_building_financial_summary"(p_building_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."create_building_poll"(p_building_id uuid, p_question text, p_description text, p_options jsonb, p_ends_at timestamp with time zone, p_show_results_before_close boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_building_poll"(p_building_id uuid, p_question text, p_description text, p_options jsonb, p_ends_at timestamp with time zone, p_show_results_before_close boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_building_poll"(p_building_id uuid, p_question text, p_description text, p_options jsonb, p_ends_at timestamp with time zone, p_show_results_before_close boolean) TO "service_role";
REVOKE ALL ON FUNCTION public."close_building_poll"(p_poll_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."close_building_poll"(p_poll_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."close_building_poll"(p_poll_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."get_building_poll_results"(p_poll_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."get_building_poll_results"(p_poll_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_building_poll_results"(p_poll_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."create_exceptional_collection"(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_exceptional_collection"(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_exceptional_collection"(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean) TO "anon";
GRANT EXECUTE ON FUNCTION public."create_exceptional_collection"(p_building_id uuid, p_title text, p_description text, p_amount_mode text, p_total_amount numeric, p_per_apartment_amount numeric, p_target_apartment_ids uuid[], p_notify_residents boolean) TO "service_role";
REVOKE ALL ON FUNCTION public."queue_mobile_notification"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."queue_mobile_notification"() TO "service_role";
REVOKE ALL ON FUNCTION public."create_building_with_opening_balance"(building_name text, building_address text, units_count integer, floors_count integer, opening_balance numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."create_building_with_opening_balance"(building_name text, building_address text, units_count integer, floors_count integer, opening_balance numeric) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_building_with_opening_balance"(building_name text, building_address text, units_count integer, floors_count integer, opening_balance numeric) TO "service_role";
REVOKE ALL ON FUNCTION public."update_building_treasury_settings"(target_building_id uuid, new_opening_balance numeric, new_reserve_fund numeric, expected_balance numeric, expected_opening_balance numeric, expected_reserve_fund numeric, opening_already_included boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."update_building_treasury_settings"(target_building_id uuid, new_opening_balance numeric, new_reserve_fund numeric, expected_balance numeric, expected_opening_balance numeric, expected_reserve_fund numeric, opening_already_included boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_building_treasury_settings"(target_building_id uuid, new_opening_balance numeric, new_reserve_fund numeric, expected_balance numeric, expected_opening_balance numeric, expected_reserve_fund numeric, opening_already_included boolean) TO "service_role";
REVOKE ALL ON FUNCTION public."capture_app_notification"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."capture_app_notification"() TO "service_role";
REVOKE ALL ON FUNCTION public."submit_building_join_request"(target_code text, applicant_full_name text, applicant_floor integer, applicant_unit_number text, applicant_resident_type text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."submit_building_join_request"(target_code text, applicant_full_name text, applicant_floor integer, applicant_unit_number text, applicant_resident_type text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."submit_building_join_request"(target_code text, applicant_full_name text, applicant_floor integer, applicant_unit_number text, applicant_resident_type text) TO "service_role";
REVOKE ALL ON FUNCTION public."approve_building_join_request"(target_request_id uuid, target_apartment_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."approve_building_join_request"(target_request_id uuid, target_apartment_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."approve_building_join_request"(target_request_id uuid, target_apartment_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."approve_building_join_request_with_label"(target_request_id uuid, target_apartment_id uuid, member_label text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."approve_building_join_request_with_label"(target_request_id uuid, target_apartment_id uuid, member_label text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."approve_building_join_request_with_label"(target_request_id uuid, target_apartment_id uuid, member_label text) TO "service_role";
REVOKE ALL ON FUNCTION public."remove_building_member"(target_building_id uuid, target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."remove_building_member"(target_building_id uuid, target_user_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."remove_building_member"(target_building_id uuid, target_user_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."set_building_member_label"(target_building_id uuid, target_user_id uuid, member_label text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."set_building_member_label"(target_building_id uuid, target_user_id uuid, member_label text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_building_member_label"(target_building_id uuid, target_user_id uuid, member_label text) TO "service_role";
REVOKE ALL ON FUNCTION public."claim_mobile_notifications"(batch_size integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."claim_mobile_notifications"(batch_size integer) TO "service_role";
REVOKE ALL ON FUNCTION public."publish_app_release"(release_id text, title text, body text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."publish_app_release"(release_id text, title text, body text) TO "service_role";
REVOKE ALL ON FUNCTION public."add_successor_manager"(member_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."add_successor_manager"(member_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."add_successor_manager"(member_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION public."manage_building_poll"(p_poll_id uuid, p_remove boolean, p_question text, p_description text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."manage_building_poll"(p_poll_id uuid, p_remove boolean, p_question text, p_description text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."manage_building_poll"(p_poll_id uuid, p_remove boolean, p_question text, p_description text) TO "service_role";
REVOKE ALL ON FUNCTION public."schedule_daily_engagement"() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."schedule_daily_engagement"() TO "service_role";
REVOKE ALL ON FUNCTION public."delete_my_account"(confirmation text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."delete_my_account"(confirmation text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_my_account"(confirmation text) TO "service_role";
REVOKE ALL ON FUNCTION public."set_building_location"(target_building_id uuid, new_latitude double precision, new_longitude double precision) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."set_building_location"(target_building_id uuid, new_latitude double precision, new_longitude double precision) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_building_location"(target_building_id uuid, new_latitude double precision, new_longitude double precision) TO "service_role";
REVOKE ALL ON FUNCTION public."delete_payment_with_treasury"(payment_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public."delete_payment_with_treasury"(payment_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_payment_with_treasury"(payment_id uuid) TO "service_role";

-- Triggers are installed after snapshot import.
