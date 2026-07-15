import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, Image,
  Dimensions, RefreshControl, ActivityIndicator, StyleSheet, Modal, Alert, Share, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import { formatCount, type MockPost, type MockUser } from "../../src/constants/mock-data";
import Avatar from "../../src/components/Avatar";
import PostTypeBadge from "../../src/components/PostTypeBadge";
import { supabase } from "../../src/lib/supabase";
import { sharePost } from "../../src/lib/share-post";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;

const REFERRAL_SHARE_LINK = "https://testflight.apple.com/join/ArPDp7sU";

type UserProfileData = { user: MockUser; posts: MockPost[]; referralCode: string | null };

async function fetchUserProfile(userId: string): Promise<UserProfileData | null> {
  const { data: u, error } = await supabase
    .from("User")
    .select("id, username, bio, avatarUrl")
    .eq("id", userId)
    .single();

  if (error || !u) return null;
  const row = u as any;

  const [followersRes, followingRes, referralRes] = await Promise.all([
    supabase.from("Follow").select("id", { count: "exact", head: true }).eq("followingId", row.id),
    supabase.from("Follow").select("id", { count: "exact", head: true }).eq("followerId", row.id),
    // Separate query so the profile still loads if the referralCode migration hasn't run yet
    supabase.from("User").select("referralCode").eq("id", row.id).single(),
  ]);

  const referralCode: string | null = (referralRes.data as any)?.referralCode ?? null;

  const user: MockUser = {
    id: row.id,
    username: row.username,
    displayName: row.displayName ?? row.username,
    avatarUrl: row.avatarUrl ?? null,
    bio: row.bio ?? "",
    followersCount: followersRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    postsCount: 0,
    isVerified: false,
  };

  const { data: postsData } = await supabase
    .from("Post")
    .select("id, caption, imageUrl, type, createdAt, Like (id, userId), Comment (id)")
    .eq("userId", row.id)
    .order("createdAt", { ascending: false });

  const posts: MockPost[] = ((postsData ?? []) as any[]).map((p) => ({
    id: p.id,
    userId: row.id,
    user,
    type: p.type as MockPost["type"],
    caption: p.caption,
    imageUrl: p.imageUrl ?? null,
    likesCount: p.Like.length,
    commentsCount: p.Comment.length,
    isLiked: false,
    createdAt: p.createdAt,
  }));

  user.postsCount = posts.length;
  return { user, posts, referralCode: referralCode ?? row.username };
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const lastTapRef = useRef<Map<string, number>>(new Map());

  const handleGridTap = useCallback((post: MockPost) => {
    const now = Date.now();
    const last = lastTapRef.current.get(post.id) ?? 0;
    if (now - last < 300) {
      lastTapRef.current.set(post.id, 0);
      if (!appUserId) return;
      const isLiked = post.isLiked;
      setData((prev) => prev ? {
        ...prev,
        posts: prev.posts.map((p) => p.id === post.id
          ? { ...p, isLiked: !isLiked, likesCount: p.likesCount + (isLiked ? -1 : 1) }
          : p),
      } : prev);
      if (isLiked) {
        supabase.from("Like").delete().eq("postId", post.id).eq("userId", appUserId)
          .then(({ error }) => { if (error) { setData((prev) => prev ? { ...prev, posts: prev.posts.map((p) => p.id === post.id ? { ...p, isLiked: error.code === "23505" ? true : post.isLiked, likesCount: p.likesCount - 1 } : p) } : prev); } });
      } else {
        const now2 = new Date().toISOString();
        supabase.from("Like").insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: post.id, userId: appUserId, createdAt: now2 })
          .then(({ error }) => { if (error) { Alert.alert("Like error", error.message); setData((prev) => prev ? { ...prev, posts: prev.posts.map((p) => p.id === post.id ? { ...p, isLiked: false, likesCount: p.likesCount - 1 } : p) } : prev); } });
      }
    } else {
      lastTapRef.current.set(post.id, now);
      setTimeout(() => {
        if (Date.now() - (lastTapRef.current.get(post.id) ?? 0) >= 300) {
          router.push(`/post/${post.id}`);
        }
      }, 300);
    }
  }, [appUserId, router]);

  const load = useCallback(async () => {
    const result = await fetchUserProfile(id);
    setData(result);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    // Check if current user follows this profile
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: appUser } = await supabase
        .from("User").select("id").eq("supabaseId", session.user.id).single();
      if (!appUser) return;
      const uid = (appUser as any).id;
      setAppUserId(uid);
      const { data: follow } = await supabase
        .from("Follow").select("id").eq("followerId", uid).eq("followingId", id).maybeSingle();
      setIsFollowing(!!follow);
    });
  }, [id, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleFollow = async () => {
    if (!appUserId || followLoading) return;
    setFollowLoading(true);
    const wasFollowing = isFollowing;
    // Optimistic update
    setIsFollowing(!wasFollowing);
    setData((prev) => prev ? {
      ...prev,
      user: { ...prev.user, followersCount: prev.user.followersCount + (wasFollowing ? -1 : 1) },
    } : prev);

    if (wasFollowing) {
      const { error } = await supabase.from("Follow").delete().eq("followerId", appUserId).eq("followingId", id);
      if (error) {
        Alert.alert("Unfollow error", error.message);
        setIsFollowing(wasFollowing);
        setData((prev) => prev ? { ...prev, user: { ...prev.user, followersCount: prev.user.followersCount + 1 } } : prev);
      }
    } else {
      const now = new Date().toISOString();
      const { error } = await supabase.from("Follow").insert({
        id: "c" + Math.random().toString(36).substring(2, 26),
        followerId: appUserId,
        followingId: id,
        createdAt: now,
      });
      if (error) {
        Alert.alert("Follow error", error.message);
        setIsFollowing(wasFollowing);
        setData((prev) => prev ? { ...prev, user: { ...prev.user, followersCount: prev.user.followersCount - 1 } } : prev);
      }
    }
    setFollowLoading(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyTitle}>User not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { user, posts, referralCode } = data;
  const isOwnProfile = appUserId === user.id;

  const handleCopyCode = () => {
    if (!referralCode) return;
    // Clipboard package isn't installed; the native share sheet lets the user copy or send the code
    Share.share({
      message: `Join me on Gains! Use my code ${referralCode} to sign up: ${REFERRAL_SHARE_LINK}`,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>@{user.username}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.dark800} />
        }
      >
        {/* Avatar full-screen modal */}
        {user.avatarUrl && (
          <Modal visible={avatarModalVisible} transparent animationType="fade" onRequestClose={() => setAvatarModalVisible(false)}>
            <Pressable style={styles.avatarModal} onPress={() => setAvatarModalVisible(false)}>
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarModalImage} resizeMode="contain" />
            </Pressable>
          </Modal>
        )}

        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <Pressable style={styles.avatarWrapper} onPress={() => user.avatarUrl && setAvatarModalVisible(true)}>
            <View style={styles.avatarRing}>
              <Avatar uri={user.avatarUrl} name={user.displayName} size={96} />
            </View>
          </Pressable>

          <Text style={styles.displayName}>{user.displayName}</Text>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

          {/* Referral Code (read-only) */}
          {referralCode ? (
            <View style={styles.referralSection}>
              <Text style={styles.referralLabel}>Referral Code</Text>
              <View style={styles.referralBox}>
                <Text style={styles.referralCode} numberOfLines={1}>{referralCode}</Text>
                <Pressable style={styles.referralCopyButton} onPress={handleCopyCode}>
                  <Text style={styles.referralCopyText}>Copy</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(user.postsCount)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem} onPress={() => router.push(`/follow-list/${user.id}?type=followers`)}>
              <Text style={styles.statValue}>{formatCount(user.followersCount)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </Pressable>
            <View style={styles.statDivider} />
            <Pressable style={styles.statItem} onPress={() => router.push(`/follow-list/${user.id}?type=following`)}>
              <Text style={styles.statValue}>{formatCount(user.followingCount)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </Pressable>
          </View>

          {!isOwnProfile && (
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.followButton, isFollowing && styles.followingButton]}
                onPress={handleFollow}
                disabled={followLoading}
              >
                <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.messageButton}
                onPress={() => router.push(`/messages/${user.id}`)}
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </Pressable>
            </View>
          )}

          {isOwnProfile && (
            <Pressable style={styles.editButton} onPress={() => router.push("/edit-profile")}>
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </Pressable>
          )}
        </View>

        {/* Posts section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Posts</Text>
        </View>

        {posts.length > 0 ? (
          <View style={styles.gridContainer}>
            {posts.map((post, index) => (
              <Pressable
                key={post.id}
                onPress={() => handleGridTap(post)}
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
                  <Pressable onPress={() => sharePost(post)} hitSlop={8}>
                    <Text style={styles.gridStatText}>↗</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyIcon}>📷</Text>
            <Text style={styles.emptyTitle}>No posts yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark800,
  },
  backButton: { width: 36, alignItems: "center" },
  backIcon: { fontSize: 22, color: Colors.gold, fontWeight: "600" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.white },
  profileHeader: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 24 },
  avatarWrapper: { marginBottom: 16 },
  avatarRing: { padding: 3, borderRadius: 54, borderWidth: 2, borderColor: Colors.gold },
  displayName: { fontSize: 22, fontWeight: "800", color: Colors.white, marginBottom: 6 },
  bio: {
    fontSize: 14, color: Colors.grayLight, textAlign: "center",
    lineHeight: 21, paddingHorizontal: 20, marginBottom: 20,
  },
  referralSection: { width: "100%", marginBottom: 20 },
  referralLabel: {
    fontSize: 12, fontWeight: "600", color: Colors.gray,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8,
  },
  referralBox: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.dark800, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.gold,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  referralCode: {
    flex: 1, fontSize: 16, fontWeight: "700", color: Colors.white, letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  referralCopyButton: {
    backgroundColor: Colors.gold, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  referralCopyText: { fontSize: 13, fontWeight: "700", color: Colors.black },
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
  actionRow: { flexDirection: "row", width: "100%", gap: 10 },
  followButton: {
    flex: 1, backgroundColor: Colors.gold,
    borderRadius: 12, paddingVertical: 14, alignItems: "center",
  },
  messageButton: {
    flex: 1, backgroundColor: Colors.dark800,
    borderRadius: 12, paddingVertical: 14, alignItems: "center",
    borderWidth: 1, borderColor: Colors.gold,
  },
  messageButtonText: { fontSize: 15, fontWeight: "700", color: Colors.gold, letterSpacing: 0.5 },
  followButtonText: { fontSize: 15, fontWeight: "700", color: Colors.black, letterSpacing: 0.5 },
  followingButton: { backgroundColor: Colors.dark800, borderWidth: 1, borderColor: Colors.dark600 },
  followingButtonText: { color: Colors.white },
  editButton: {
    width: "100%", backgroundColor: Colors.gold,
    borderRadius: 12, paddingVertical: 14, alignItems: "center",
  },
  editButtonText: { fontSize: 15, fontWeight: "700", color: Colors.black, letterSpacing: 0.5 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: Colors.dark800 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: Colors.white },
  gridContainer: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 100 },
  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, overflow: "hidden", position: "relative" },
  gridImage: { width: "100%", height: "100%" },
  gridPlaceholder: { backgroundColor: Colors.dark800, padding: 12, justifyContent: "center" },
  gridQuoteText: { fontSize: 11, color: Colors.grayLight, lineHeight: 16, fontStyle: "italic" },
  gridBadge: { position: "absolute", top: 8, left: 8 },
  gridOverlay: {
    position: "absolute", bottom: 8, right: 8,
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  gridStatText: { fontSize: 11, color: Colors.white, fontWeight: "600" },
  emptyGrid: { alignItems: "center", paddingTop: 60, paddingBottom: 100 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: Colors.white },
  avatarModal: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center", justifyContent: "center",
  },
  avatarModalImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
});
