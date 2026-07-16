-- Performance indexes for the Gains mobile app's hottest query patterns.
-- Safe to run repeatedly (IF NOT EXISTS).

-- Feed queries filter/sort by userId and createdAt
CREATE INDEX IF NOT EXISTS "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Post_createdAt_idx" ON "Post"("createdAt" DESC);

-- Like lookups (isLiked check, count)
CREATE INDEX IF NOT EXISTS "Like_postId_userId_idx" ON "Like"("postId", "userId");
CREATE INDEX IF NOT EXISTS "Like_userId_idx" ON "Like"("userId");

-- Comment lookups
CREATE INDEX IF NOT EXISTS "Comment_postId_idx" ON "Comment"("postId");

-- Follow lookups (follower/following resolution)
CREATE INDEX IF NOT EXISTS "Follow_followerId_idx" ON "Follow"("followerId");
CREATE INDEX IF NOT EXISTS "Follow_followingId_idx" ON "Follow"("followingId");

-- Save lookups
CREATE INDEX IF NOT EXISTS "Save_postId_userId_idx" ON "Save"("postId", "userId");
CREATE INDEX IF NOT EXISTS "Save_userId_idx" ON "Save"("userId");

-- Notification lookups
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- Message lookups (inbox, chat)
CREATE INDEX IF NOT EXISTS "Message_senderId_recipientId_idx" ON "Message"("senderId", "recipientId");
CREATE INDEX IF NOT EXISTS "Message_recipientId_createdAt_idx" ON "Message"("recipientId", "createdAt" DESC);

-- Block lookups
CREATE INDEX IF NOT EXISTS "Block_blockerId_idx" ON "Block"("blockerId");

-- Note: "User"."supabaseId" already has a unique index (Prisma @unique),
-- so no additional index is needed for auth-session resolution.

-- Group chat lookups (inbox groups tab)
CREATE INDEX IF NOT EXISTS "GroupMember_userId_idx" ON "GroupMember"("userId");
CREATE INDEX IF NOT EXISTS "GroupMember_groupId_idx" ON "GroupMember"("groupId");
CREATE INDEX IF NOT EXISTS "GroupMessage_groupId_createdAt_idx" ON "GroupMessage"("groupId", "createdAt" DESC);
