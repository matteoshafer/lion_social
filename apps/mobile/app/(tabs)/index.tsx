import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Colors from "../../src/constants/colors";
import { type MockPost } from "../../src/constants/mock-data";
import PostCard from "../../src/components/PostCard";
import { supabase } from "../../src/lib/supabase";
import { getAppUserId } from "../../src/lib/auth";

const POST_SELECT = `
  id, caption, imageUrl, type, createdAt, userId,
  User!inner (id, username, avatarUrl),
  Like (id, userId),
  Comment (id),
  Save (id, userId)
`;

function scorePost(post: any): number {
  const hoursOld = (Date.now() - new Date(post.createdAt).getTime()) / 36e5;
  const recencyBoost = Math.max(0, (48 - hoursOld) / 48) * 10;
  return post.Like.length * 2 + post.Comment.length * 3 + recencyBoost;
}

function mapPost(p: any, currentUserId: string | null): MockPost {
  return {
    id: p.id,
    userId: p.User.id,
    user: {
      id: p.User.id,
      username: p.User.username,
      displayName: p.User.username,
      avatarUrl: p.User.avatarUrl ?? null,
      bio: "",
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      isVerified: false,
    },
    type: p.type as MockPost["type"],
    caption: p.caption,
    imageUrl: p.imageUrl ?? null,
    likesCount: p.Like.length,
    commentsCount: p.Comment.length,
    isLiked: currentUserId
      ? p.Like.some((l: any) => l.userId === currentUserId)
      : false,
    isSaved: currentUserId
      ? (p.Save ?? []).some((s: any) => s.userId === currentUserId)
      : false,
    createdAt: p.createdAt,
  };
}

async function fetchBlockedIds(currentUserId: string): Promise<Set<string>> {
  const { data } = await supabase.from("Block").select("blockedId").eq("blockerId", currentUserId);
  return new Set((data ?? []).map((b: any) => b.blockedId));
}

async function fetchFeedPosts(currentUserId: string | null): Promise<MockPost[]> {
  // Guest: newest posts from everyone, no personalization
  if (!currentUserId) {
    const { data, error } = await supabase
      .from("Post")
      .select(POST_SELECT)
      .order("createdAt", { ascending: false })
      .limit(20);
    if (error || !data) return [];
    return (data as any[]).map((p) => mapPost(p, null));
  }

  // Step 1: who does the current user follow? (blocked list is independent —
  // fetch it in parallel instead of after the feed queries)
  const [{ data: follows }, blockedIds] = await Promise.all([
    supabase.from("Follow").select("followingId").eq("followerId", currentUserId),
    fetchBlockedIds(currentUserId),
  ]);
  const followingIds = (follows ?? []).map((f: any) => f.followingId);

  // Tier 1 (following, weighted) and Tier 2 (discovery) are independent —
  // run both queries in parallel.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 36e5).toISOString();
  const excludedUserIds = [currentUserId, ...followingIds];

  const [tier1Res, tier2Res] = await Promise.all([
    followingIds.length > 0
      ? supabase
          .from("Post")
          .select(POST_SELECT)
          .in("userId", followingIds)
          .order("createdAt", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("Post")
      .select(POST_SELECT)
      .gte("createdAt", sevenDaysAgo)
      .not("userId", "in", `(${excludedUserIds.join(",")})`)
      .order("createdAt", { ascending: false })
      .limit(50),
  ]);

  // Tier 1 — Following (weighted): last 50 posts from followed users,
  // scored by engagement + recency, top 20
  const tier1 = ((tier1Res.data ?? []) as any[])
    .map((p) => ({ post: p, score: scorePost(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((x) => x.post);

  // Tier 2 — Discovery: most-liked posts from the past 7 days,
  // excluding followed users, self, and Tier 1 posts; top 10
  const discoveryData = tier2Res.data;

  const tier1Ids = new Set(tier1.map((p) => p.id));
  const tier2 = ((discoveryData ?? []) as any[])
    .filter((p) => !tier1Ids.has(p.id))
    .sort((a, b) => b.Like.length - a.Like.length)
    .slice(0, 10);

  // Interleave: Tier 1 first, then Tier 2; dedupe by post ID
  const seen = new Set<string>();
  const combined: any[] = [];
  for (const p of [...tier1, ...tier2]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    combined.push(p);
  }

  return combined
    .filter((p) => !blockedIds.has(p.userId ?? p.User?.id))
    .slice(0, 30)
    .map((p) => mapPost(p, currentUserId));
}

export default function HomeScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState<MockPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const uid = await getAppUserId();
      if (!cancelled) setCurrentUserId(uid);
      const result = await fetchFeedPosts(uid);
      if (!cancelled) { setPosts(result); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await fetchFeedPosts(currentUserId);
    setPosts(result);
    setRefreshing(false);
  }, [currentUserId]);

  // Re-sync like states when navigating back to the feed
  useFocusEffect(useCallback(() => {
    if (posts.length === 0) return;
    fetchFeedPosts(currentUserId).then((updated) => setPosts(updated));
  }, [currentUserId, posts.length]));

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerLeft}>
        <Text style={styles.titleText}>GAINS</Text>
        <View style={styles.titleAccent} />
      </View>
      <Pressable style={styles.messagesButton} onPress={() => router.push("/(tabs)/messages")} hitSlop={8}>
        <Text style={styles.messagesIcon}>💬</Text>
      </Pressable>
    </View>
  );

  const renderPost = ({ item }: { item: MockPost }) => (
    <PostCard
      post={item}
      currentUserId={currentUserId}
      initialSaved={item.isSaved}
      onBlock={(blockedUserId) => setPosts((prev) => prev.filter((p) => p.userId !== blockedUserId))}
      onDelete={() => setPosts((prev) => prev.filter((p) => p.id !== item.id))}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🦁</Text>
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptySubtitle}>Be the first to share your gains</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={10}
        initialNumToRender={5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
            progressBackgroundColor={Colors.dark800}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 100 },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  titleText: { fontSize: 28, fontWeight: "800", color: Colors.gold, letterSpacing: 4 },
  titleAccent: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.gold, marginLeft: 8, opacity: 0.6,
  },
  messagesButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.dark800, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.dark700,
  },
  messagesIcon: { fontSize: 18 },
  separator: { height: 1, backgroundColor: Colors.dark800, marginHorizontal: 20 },
  emptyContainer: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingTop: 80, paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: Colors.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: Colors.gray, textAlign: "center", lineHeight: 22 },
});
