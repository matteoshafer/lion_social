-- Enable Realtime for the Notification table (idempotent).
-- Required so the app's postgres_changes subscription receives
-- new notifications without a manual refresh.
-- Run in Supabase Dashboard → SQL Editor → New query.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='Notification') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "Notification";
  END IF;
END $$;
