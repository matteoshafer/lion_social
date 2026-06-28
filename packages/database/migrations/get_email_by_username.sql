-- ============================================================
-- Create get_email_by_username RPC for username-based login
-- Run this in Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times (CREATE OR REPLACE)
-- ============================================================

-- The function looks up the email from "User".email first,
-- then falls back to auth.users.email if User.email is null
-- (happens when a user was created before email was stored on User row).

CREATE OR REPLACE FUNCTION get_email_by_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.email, a.email)
  FROM "User" u
  LEFT JOIN auth.users a ON u."supabaseId" = a.id
  WHERE lower(u.username) = lower(p_username)
  LIMIT 1;
$$;

-- Grant execute to anon so the sign-in screen (pre-auth) can call it
GRANT EXECUTE ON FUNCTION get_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION get_email_by_username(text) TO authenticated;
