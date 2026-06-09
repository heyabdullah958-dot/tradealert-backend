-- Create a function that inserts a new user into public."User"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to bypass RLS on public."User"
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."User" (id, email, "subscriptionTier", "createdAt", "updatedAt")
  VALUES (
    new.id,
    new.email,
    'BASIC'::"Tier",
    now(),
    now()
  );
  RETURN new;
END;
$$;

-- Trigger the function every time a user is created in auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- Create a function to handle deleting a user
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public."User" WHERE id = old.id;
  RETURN old;
END;
$$;

-- Trigger the function every time a user is deleted from auth.users
CREATE OR REPLACE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();
