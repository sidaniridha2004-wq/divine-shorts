
-- Auto-promote users matching a configured admin email to admin role.
-- The email is read from the profile row (populated by handle_new_user trigger).
CREATE OR REPLACE FUNCTION public.auto_grant_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_emails TEXT[] := ARRAY['admin@example.com'];
BEGIN
  IF NEW.email IS NOT NULL AND lower(NEW.email) = ANY(SELECT lower(unnest(admin_emails))) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_grant_admin ON public.profiles;
CREATE TRIGGER on_profile_created_grant_admin
AFTER INSERT OR UPDATE OF email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.auto_grant_admin_role();
