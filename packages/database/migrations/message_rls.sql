-- Messaging: Realtime + Row Level Security for the "Message" table.
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- Safe to run multiple times.

-- ── 1. Enable Realtime for Message ──────────────────────────────────────────
-- Without this, the mobile app's postgres_changes subscription never fires
-- and new messages only appear after a manual refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'Message'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Message";
  END IF;
END $$;

-- ── 2. Row Level Security ────────────────────────────────────────────────────
-- The app authenticates with Supabase Auth; the app-level user row is linked
-- via "User"."supabaseId" = auth.uid(). Policies below let only the sender and
-- recipient read a message, only the sender insert it, and either participant
-- update it (needed so the recipient can mark messages as read).

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_select_participants" ON "Message";
CREATE POLICY "message_select_participants" ON "Message"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id IN ("Message"."senderId", "Message"."recipientId")
    )
  );

DROP POLICY IF EXISTS "message_insert_sender" ON "Message";
CREATE POLICY "message_insert_sender" ON "Message"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id = "Message"."senderId"
    )
  );

DROP POLICY IF EXISTS "message_update_participants" ON "Message";
CREATE POLICY "message_update_participants" ON "Message"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id IN ("Message"."senderId", "Message"."recipientId")
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id IN ("Message"."senderId", "Message"."recipientId")
    )
  );
