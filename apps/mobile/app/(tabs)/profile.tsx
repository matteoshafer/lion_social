import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import { formatCount, type MockPost, type MockUser } from "../../src/constants/mock-data";
import Avatar from "../../src/components/Avatar";
import PostTypeBadge from "../../src/components/PostTypeBadge";
import { supabase } from "../../src/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;

type ProfileTab = "posts" | "saved";

async function ensureUserRecord(session: { user: { id: string; email?: string; user_metadata?: any } }) {
  const username = (session.user.user_metadata?.username as string) ?? session.user.email?.split("@")[0] ?? "user";
  const displayName = (session.user.user_metadata?.displayName as string) ?? username;
  const email = session.user.email ?? "";
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date().toISOString();

  // Try with email field first
  const { error } = await supabase.from("User").insert({
    supabaseId: session.user.id,
    username,
    displayName,
    email,
    inviteCode,
    createdAt: now,
    updatedAt: now,
  });

  // Fallback without email in case the column isn't in PostgREST schema cache yet
  if (error) {
    await supabase.from("User").insert({
      supabaseId: session.user.id,
      username,
      displayName,
      inviteCode,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function fetchProfile(): Promise<{ user: MockUser; posts: MockPost[] } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: appUser, error: userError } = await supabase
    .from("User")
    .select("id, username, bio, avatarUrl")
    .eq("supabaseId", session.user.id)
    .single();

  if (userError || !appUser) {
    await ensureUserRecord(session);
    const { data: retried } = await supabase
      .from("User")
      .select("id, username, bio, avatarUrl")
      .eq("supabaseId", session.user.id)
      .single();
    if (!retried) return null;
    return fetchProfileForUser(retried as any);
  }

  return fetchProfileForUser(appUser as any);
}

async function fetchProfileForUser(u: any): Promise<{ user: MockUser; posts: MockPost[] } | null> {
  const [followersRes, followingRes] = await Promise.all([
    supabase.from("Follow").select("id", { count: "exact", head: true }).eq("followingId", u.id),
    supabase.from("Follow").select("id", { count: "exact", head: true }).eq("followerId", u.id),
  ]);

  const user: MockUser = {
    id: u.id,
    username: u.username,
    displayName: u.displayName ?? u.username,
    avatarUrl: u.avatarUrl ?? null,
    bio: u.bio ?? "",
    followersCount: followersRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    postsCount: 0,
    isVerified: false,
  };

  const { data: postsData, error: postsError } = await supabase
    .from("Post")
    .select(`
      id, caption, imageUrl, type, createdAt,
      Like (id, userId),
      Comment (id)
    `)
    .eq("userId", u.id)
    .order("createdAt", { ascending: false });

  if (postsError || !postsData) return { user, posts: [] };

  user.postsCount = postsData.length;

  const posts: MockPost[] = (postsData as any[]).map((p) => ({
    id: p.id,
    userId: u.id,
    user,
    type: p.type as MockPost["type"],
    caption: p.caption,
    imageUrl: p.imageUrl ?? null,
    likesCount: p.Like.length,
    commentsCount: p.Comment.length,
    isLiked: false,
    createdAt: p.createdAt,
  }));

  return { user, posts };
}

export default function ProfileScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [currentUser, setCurrentUser] = useState<MockUser | null>(null);
  const [userPosts, setUserPosts] = useState<MockPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchProfile();
    if (result) {
      setCurrentUser(result.user);
      setUserPosts(result.posts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const displayPosts = activeTab === "posts" ? userPosts : [];

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyTitle}>Not logged in</Text>

        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.gold}
            colors={[Colors.gold]}
            progressBackgroundColor={Colors.dark800}
          />
        }
      >
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <Text style={styles.username}>@{currentUser.username}</Text>
          <Pressable style={styles.settingsButton} onPress={() => router.push("/edit-profile")}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>

        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarRing}>
              <Avatar uri={currentUser.avatarUrl} name={currentUser.displayName} size={96} />
            </View>
            {currentUser.isVerified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedIcon}>✓</Text>
              </View>
            )}
          </View>

          <Text style={styles.displayName}>{currentUser.displayName}</Text>
          <Text style={styles.bio}>{currentUser.bio}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(currentUser.postsCount)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem} onPress={() => router.push(`/follow-list/${currentUser.id}?type=followers`)}>
              <Text style={styles.statValue}>{formatCount(currentUser.followersCount)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem} onPress={() => router.push(`/follow-list/${currentUser.id}?type=following`)}>
              <Text style={styles.statValue}>{formatCount(currentUser.followingCount)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.editButton} onPress={() => router.push("/edit-profile")}>
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </Pressable>
            <Pressable style={styles.shareButton} onPress={() => Share.share({ message: `Check out @${currentUser.username} on Gains!` })}>
              <Text style={styles.shareButtonText}>Share</Text>
            </Pressable>
          </View>
        </View>

        {/* Post Tabs */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab("posts")}
            style={[styles.tab, activeTab === "posts" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "posts" && styles.tabTextActive]}>Posts</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("saved")}
            style={[styles.tab, activeTab === "saved" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "saved" && styles.tabTextActive]}>Saved</Text>
          </Pressable>
        </View>

        {/* Post Grid */}
        {displayPosts.length > 0 ? (
          <View style={styles.gridContainer}>
            {displayPosts.map((post, index) => (
              <Pressable
                key={post.id}
                onPress={() => router.push(`/post/${post.id}`)}
                style={[
                  styles.gridItem,
                  { marginRight: (index + 1) % 3 === 0 ? 0 : GRID_GAP, marginBottom: GRID_GAP },
                ]}
              >
                {post.imageUrl ? (
                  <Image source={{ uri: post.imageUrl }} style={styles.gridImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.gridImage, styles.gridPlaceholder]}>
                    <Text style={styles.gridQuoteText} numberOfLines={5}>{post.caption}</Text>
                  </View>
                )}
                <View style={styles.gridBadge}>
                  <PostTypeBadge type={post.type} size="small" />
                </View>
                <View style={styles.gridOverlay}>
                  <Text style={styles.gridStatText}>♥ {formatCount(post.likesCount)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyIcon}>{activeTab === "saved" ? "📌" : "📷"}</Text>
            <Text style={styles.emptyTitle}>
              {activeTab === "saved" ? "No saved posts" : "No posts yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "saved"
                ? "Save posts to revisit your favorite content"
                : "Share your first post with the community"}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingHorizontal: 20, paddingVertical: 12,
  },
  username: { fontSize: 18, fontWeight: "700", color: Colors.white, letterSpacing: 0.3 },
  settingsButton: { padding: 4 },
  settingsIcon: { fontSize: 22 },
  profileHeader: { alignItems: "center", paddingHorizontal: 20, paddingBottom: 24 },
  avatarWrapper: { position: "relative", marginBottom: 16 },
  avatarRing: { padding: 3, borderRadius: 54, borderWidth: 2, borderColor: Colors.gold },
  verifiedBadge: {
    position: "absolute", bottom: 0, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: Colors.black,
  },
  verifiedIcon: { fontSize: 14, fontWeight: "700", color: Colors.black },
  displayName: { fontSize: 22, fontWeight: "800", color: Colors.white, marginBottom: 6 },
  bio: {
    fontSize: 14, color: Colors.grayLight, textAlign: "center",
    lineHeight: 21, paddingHorizontal: 20, marginBottom: 20,
  },
  statsRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.dark800, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 24, marginBottom: 20,
    borderWidth: 1, borderColor: Colors.dark700, width: "100%",
  },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: Colors.white, marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: "500", color: Colors.gray, textTransform: "uppercase", letterSpacing: 0.5 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.dark600 },
  actionRow: { flexDirection: "row", gap: 12, width: "100%" },
  editButton: { flex: 1, backgroundColor: Colors.gold, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  editButtonText: { fontSize: 15, fontWeight: "700", color: Colors.black, letterSpacing: 0.5 },
  shareButton: {
    paddingHorizontal: 24, backgroundColor: Colors.dark800,
    borderRadius: 12, paddingVertical: 14, alignItems: "center",
    borderWidth: 1, borderColor: Colors.dark600,
  },
  shareButtonText: { fontSize: 15, fontWeight: "700", color: Colors.white },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: Colors.dark700, marginTop: 8 },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: Colors.gold },
  tabText: { fontSize: 14, fontWeight: "600", color: Colors.gray, textTransform: "uppercase", letterSpacing: 1 },
  tabTextActive: { color: Colors.gold },
  gridContainer: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 100 },
  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, overflow: "hidden", position: "relative" },
  gridImage: { width: "100%", height: "100%" },
  gridPlaceholder: { backgroundColor: Colors.dark800, padding: 12, justifyContent: "center" },
  gridQuoteText: { fontSize: 11, color: Colors.grayLight, lineHeight: 16, fontStyle: "italic" },
  gridBadge: { position: "absolute", top: 8, left: 8 },
  gridOverlay: {
    position: "absolute", bottom: 8, right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  gridStatText: { fontSize: 11, color: Colors.white, fontWeight: "600" },
  emptyGrid: {
    alignItems: "center", justifyContent: "center",
    paddingTop: 60, paddingHorizontal: 40, paddingBottom: 100,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: Colors.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.gray, textAlign: "center", lineHeight: 21 },
});
