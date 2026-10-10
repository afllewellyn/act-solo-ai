-- handle_new_user() is a SECURITY DEFINER signup trigger function (trigger on auth.users).
-- It must not be callable through the public REST API (/rest/v1/rpc/handle_new_user) by
-- anonymous or signed-in users. Trigger execution does not check the invoking role's
-- EXECUTE privilege, so signup keeps working.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
