-- ============================================================
-- Notification triggers — auto-create notifications on:
--   Like insert, Comment insert, Follow insert
-- Plus Row Level Security so recipients can read / mark-read
-- their own notifications.
--
-- Run in Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times (CREATE OR REPLACE + DROP IF EXISTS)
--
-- Notification.referenceId format:
--   like/comment/save : '<actorUserId>:<postId>'
--   follow            : '<followerUserId>'
-- ============================================================

-- ── LIKE → notify post owner ────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner TEXT;
BEGIN
  SELECT "userId" INTO post_owner FROM "Post" WHERE id = NEW."postId";
  -- Don't notify if liking your own post
  IF post_owner IS NULL OR post_owner = NEW."userId" THEN RETURN NEW; END IF;

  INSERT INTO "Notification" (id, "userId", type, "referenceId", read, "createdAt")
  VALUES (
    'notif' || replace(gen_random_uuid()::text, '-', ''),
    post_owner,
    'like',
    NEW."userId" || ':' || NEW."postId",
    false,
    NOW()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_like_insert ON "Like";
CREATE TRIGGER on_like_insert
  AFTER INSERT ON "Like"
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- ── COMMENT → notify post owner ─────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner TEXT;
BEGIN
  SELECT "userId" INTO post_owner FROM "Post" WHERE id = NEW."postId";
  -- Don't notify if commenting on your own post
  IF post_owner IS NULL OR post_owner = NEW."userId" THEN RETURN NEW; END IF;

  INSERT INTO "Notification" (id, "userId", type, "referenceId", read, "createdAt")
  VALUES (
    'notif' || replace(gen_random_uuid()::text, '-', ''),
    post_owner,
    'comment',
    NEW."userId" || ':' || NEW."postId",
    false,
    NOW()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_comment_insert ON "Comment";
CREATE TRIGGER on_comment_insert
  AFTER INSERT ON "Comment"
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- ── FOLLOW → notify the person being followed ────────────────
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW."followerId" = NEW."followingId" THEN RETURN NEW; END IF;

  INSERT INTO "Notification" (id, "userId", type, "referenceId", read, "createdAt")
  VALUES (
    'notif' || replace(gen_random_uuid()::text, '-', ''),
    NEW."followingId",
    'follow',
    NEW."followerId",
    false,
    NOW()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_insert ON "Follow";
CREATE TRIGGER on_follow_insert
  AFTER INSERT ON "Follow"
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- ── Row Level Security ───────────────────────────────────────
-- App users authenticate via Supabase Auth; the app-level user row
-- is linked via "User"."supabaseId" = auth.uid(). The recipient may
-- read their notifications (also required for Realtime delivery)
-- and update them (mark as read).

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_select_recipient" ON "Notification";
CREATE POLICY "notification_select_recipient" ON "Notification"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id = "Notification"."userId"
    )
  );

DROP POLICY IF EXISTS "notification_update_recipient" ON "Notification";
CREATE POLICY "notification_update_recipient" ON "Notification"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id = "Notification"."userId"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."supabaseId" = auth.uid()::text
        AND u.id = "Notification"."userId"
    )
  );
