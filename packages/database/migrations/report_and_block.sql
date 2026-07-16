-- Block table
CREATE TABLE IF NOT EXISTS "Block" (
  id TEXT PRIMARY KEY,
  "blockerId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "blockedId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("blockerId", "blockedId")
);

ALTER TABLE "Block" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "block_select_own" ON "Block";
CREATE POLICY "block_select_own" ON "Block" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u."supabaseId" = auth.uid()::text AND u.id = "Block"."blockerId"));

DROP POLICY IF EXISTS "block_insert_own" ON "Block";
CREATE POLICY "block_insert_own" ON "Block" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u."supabaseId" = auth.uid()::text AND u.id = "Block"."blockerId"));

DROP POLICY IF EXISTS "block_delete_own" ON "Block";
CREATE POLICY "block_delete_own" ON "Block" FOR DELETE
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u."supabaseId" = auth.uid()::text AND u.id = "Block"."blockerId"));

-- Report table
CREATE TABLE IF NOT EXISTS "Report" (
  id TEXT PRIMARY KEY,
  "reporterId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  reason TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "report_insert_own" ON "Report";
CREATE POLICY "report_insert_own" ON "Report" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u."supabaseId" = auth.uid()::text AND u.id = "Report"."reporterId"));

DROP POLICY IF EXISTS "report_select_own" ON "Report";
CREATE POLICY "report_select_own" ON "Report" FOR SELECT
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u."supabaseId" = auth.uid()::text AND u.id = "Report"."reporterId"));
