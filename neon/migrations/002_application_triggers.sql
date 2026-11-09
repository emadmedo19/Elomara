CREATE TRIGGER announcements_inbox AFTER INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER maintenance_inbox AFTER INSERT OR UPDATE ON public.maintenance_tickets FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER overdue_inbox AFTER UPDATE ON public.apartments FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER bookings_inbox AFTER INSERT OR UPDATE ON public.facility_bookings FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER payments_inbox AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER expenses_inbox AFTER INSERT OR DELETE OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER join_requests_inbox AFTER INSERT OR UPDATE ON public.building_join_requests FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER polls_inbox AFTER INSERT OR UPDATE ON public.building_polls FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER treasury_settings_inbox AFTER INSERT ON public.building_treasury_settings_audit FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER app_settings_inbox AFTER INSERT OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION capture_app_notification();
CREATE TRIGGER queue_mobile_notification AFTER INSERT ON public.app_notifications FOR EACH ROW EXECUTE FUNCTION queue_mobile_notification();
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

