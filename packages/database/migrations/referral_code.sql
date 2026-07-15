-- Add referralCode column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT UNIQUE;

-- Backfill existing users with their username as default code
UPDATE "User" SET "referralCode" = username WHERE "referralCode" IS NULL;

-- Function to validate referral code uniqueness (used by app)
CREATE OR REPLACE FUNCTION check_referral_code_available(p_code TEXT, p_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM "User" WHERE "referralCode" = p_code AND id != p_user_id
  );
$$;
GRANT EXECUTE ON FUNCTION check_referral_code_available TO authenticated;
