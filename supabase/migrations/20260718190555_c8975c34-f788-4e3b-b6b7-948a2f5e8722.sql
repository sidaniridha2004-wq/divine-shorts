
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_payment(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment(UUID, TEXT) TO authenticated;
