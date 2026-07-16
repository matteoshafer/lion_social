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
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import { formatCount, type MockPost, type MockUser } from "../../src/constants/mock-data";
import Avatar from "../../src/components/Avatar";
import PostTypeBadge from "../../src/components/PostTypeBadge";
import { supabase } from "../../src/lib/supabase";
import { invalidateAppUserCache } from "../../src/lib/auth";
import { sharePost } from "../../src/lib/share-post";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;

type ProfileTab = "posts" | "liked" | "saved";

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

const REFERRAL_SHARE_LINK = "https://testflight.apple.com/join/ArPDp7sU";

type ProfileData = { user: MockUser; posts: MockPost[]; referralCode: string | null };

async function fetchProfile(): Promise<ProfileData | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // maybeSingle: "no row yet" is a valid state here (first login creates the record)
  const { data: appUser, error: userError } = await supabase
    .from("User")
    .select("id, username, bio, avatarUrl")
    .eq("supabaseId", session.user.id)
    .maybeSingle();

  if (userError || !appUser) {
    await ensureUserRecord(session);
    invalidateAppUserCache(); // a User row now exists; drop any cached "null"
    const { data: retried } = await supabase
      .from("User")
      .select("id, username, bio, avatarUrl")
      .eq("supabaseId", session.user.id)
      .maybeSingle();
    if (!retried) return null;
    return fetchProfileForUser(retried as any);
  }

  return fetchProfileForUser(appUser as any);
}

async function fetchSavedPosts(userId: string): Promise<MockPost[]> {
  const { data, error } = await supabase
    .from("Save")
    .select(`
      id, createdAt,
      Post (
        id, caption, imageUrl, type, createdAt, userId,
        User (id, username, avatarUrl),
        Like (id),
        Comment (id)
      )
    `)
    .eq("userId", userId)
    .order("createdAt", { ascending: false });

  if (error || !data) return [];

  return (data as any[])
    .filter((s) => s.Post)
    .map((s) => {
      const p = s.Post;
      return {
        id: p.id,
        userId: p.userId,
        user: {
          id: p.User?.id ?? p.userId,
          username: p.User?.username ?? "user",
          displayName: p.User?.username ?? "user",
          avatarUrl: p.User?.avatarUrl ?? null,
          bio: "",
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          isVerified: false,
        },
        type: p.type as MockPost["type"],
        caption: p.caption,
        imageUrl: p.imageUrl ?? null,
        likesCount: (p.Like ?? []).length,
        commentsCount: (p.Comment ?? []).length,
        isLiked: false,
        createdAt: p.createdAt,
      };
    });
}

async function fetchLikedPosts(userId: string): Promise<MockPost[]> {
  const { data, error } = await supabase
    .from("Like")
    .select(`
      createdAt,
      Post!inner (
        id, caption, imageUrl, type, createdAt, userId,
        User!inner (id, username, avatarUrl),
        Like (id, userId),
        Comment (id)
      )
    `)
    .eq("userId", userId)
    .order("createdAt", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  return (data as any[])
    .filter((l) => l.Post)
    .map((l) => {
      const p = l.Post;
      return {
        id: p.id,
        userId: p.userId,
        user: {
          id: p.User?.id ?? p.userId,
          username: p.User?.username ?? "user",
          displayName: p.User?.username ?? "user",
          avatarUrl: p.User?.avatarUrl ?? null,
          bio: "",
          followersCount: 0,
          followingCount: 0,
          postsCount: 0,
          isVerified: false,
        },
        type: p.type as MockPost["type"],
        caption: p.caption,
        imageUrl: p.imageUrl ?? null,
        likesCount: (p.Like ?? []).length,
        commentsCount: (p.Comment ?? []).length,
        isLiked: true,
        createdAt: p.createdAt,
      };
    });
}

async function fetchProfileForUser(u: any): Promise<ProfileData | null> {
  // All four queries are independent — run them in a single parallel batch
  const [followersRes, followingRes, referralRes, postsRes] = await Promise.all([
    supabase.from("Follow").select("id", { count: "exact", head: true }).eq("followingId", u.id),
    supabase.from("Follow").select("id", { count: "exact", head: true }).eq("followerId", u.id),
    // Separate query so the profile still loads if the referralCode migration hasn't run yet
    supabase.from("User").select("referralCode").eq("id", u.id).single(),
    supabase
      .from("Post")
      .select(`
        id, caption, imageUrl, type, createdAt,
        Like (id, userId),
        Comment (id)
      `)
      .eq("userId", u.id)
      .order("createdAt", { ascending: false }),
  ]);

  const referralCode: string | null = (referralRes.data as any)?.referralCode ?? null;

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

  const { data: postsData, error: postsError } = postsRes;

  if (postsError || !postsData) return { user, posts: [], referralCode };

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

  return { user, posts, referralCode };
}

export default function ProfileScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [currentUser, setCurrentUser] = useState<MockUser | null>(null);
  const [userPosts, setUserPosts] = useState<MockPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savedPosts, setSavedPosts] = useState<MockPost[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [likedPosts, setLikedPosts] = useState<MockPost[]>([]);
  const [likedLoading, setLikedLoading] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchProfile();
    if (result) {
      setCurrentUser(result.user);
      setUserPosts(result.posts);
      setReferralCode(result.referralCode ?? result.user.username);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load saved posts when the Saved tab is opened
  useEffect(() => {
    if (activeTab !== "saved" || !currentUser) return;
    let cancelled = false;
    setSavedLoading(true);
    fetchSavedPosts(currentUser.id).then((posts) => {
      if (!cancelled) { setSavedPosts(posts); setSavedLoading(false); }
    });
    return () => { cancelled = true; };
  }, [activeTab, currentUser]);

  // Load liked posts when the Liked tab is opened
  useEffect(() => {
    if (activeTab !== "liked" || !currentUser) return;
    let cancelled = false;
    setLikedLoading(true);
    fetchLikedPosts(currentUser.id).then((posts) => {
      if (!cancelled) { setLikedPosts(posts); setLikedLoading(false); }
    });
    return () => { cancelled = true; };
  }, [activeTab, currentUser]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (activeTab === "saved" && currentUser) {
      setSavedPosts(await fetchSavedPosts(currentUser.id));
    }
    if (activeTab === "liked" && currentUser) {
      setLikedPosts(await fetchLikedPosts(currentUser.id));
    }
    setRefreshing(false);
  }, [load, activeTab, currentUser]);

  const handleCopyCode = useCallback(() => {
    if (!referralCode) return;
    // Clipboard package isn't installed; the native share sheet lets the user copy or send the code
    Share.share({
      message: `Join me on Gains! Use my code ${referralCode} to sign up: ${REFERRAL_SHARE_LINK}`,
    });
  }, [referralCode]);

  const startEditingCode = useCallback(() => {
    setCodeDraft(referralCode ?? "");
    setCodeError(null);
    setEditingCode(true);
  }, [referralCode]);

  const handleSaveCode = useCallback(async () => {
    if (!currentUser || savingCode) return;
    const newCode = codeDraft.trim();
    if (!newCode) {
      setCodeError("Code can't be empty");
      return;
    }
    if (newCode === referralCode) {
      setEditingCode(false);
      setCodeError(null);
      return;
    }
    setSavingCode(true);
    setCodeError(null);

    const { data: available, error: rpcError } = await supabase.rpc("check_referral_code_available", {
      p_code: newCode,
      p_user_id: currentUser.id,
    });

    if (rpcError) {
      setCodeError("Couldn't validate code. Try again.");
      setSavingCode(false);
      return;
    }
    if (!available) {
      setCodeError("That code is already taken");
      setSavingCode(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("User")
      .update({ referralCode: newCode })
      .eq("id", currentUser.id);

    if (updateError) {
      setCodeError(updateError.code === "23505" ? "That code is already taken" : "Couldn't save code. Try again.");
    } else {
      setReferralCode(newCode);
      setEditingCode(false);
    }
    setSavingCode(false);
  }, [currentUser, savingCode, codeDraft, referralCode]);

  const displayPosts =
    activeTab === "posts" ? userPosts : activeTab === "liked" ? likedPosts : savedPosts;

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
        <View style={[styles.loadingContainer, { paddingHorizontal: 40 }]}>
          <Text style={styles.emptyIcon}>👤</Text>
          <Text style={styles.emptyTitle}>Not signed in</Text>
          <Text style={[styles.emptySubtitle, { marginBottom: 24 }]}>
            Sign in to see your profile, posts, and followers
          </Text>
          <Pressable style={styles.signInCta} onPress={() => router.push("/(auth)/sign-in")}>
            <Text style={styles.signInCtaText}>Sign In</Text>
          </Pressable>
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
          <Pressable style={styles.settingsButton} onPress={() => router.push("/edit-profile")} hitSlop={8}>
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

          {/* Referral Code */}
          <View style={styles.referralSection}>
            <Text style={styles.referralLabel}>Referral Code</Text>
            <View style={styles.referralBox}>
              {editingCode ? (
                <>
                  <TextInput
                    style={styles.referralInput}
                    value={codeDraft}
                    onChangeText={(t) => { setCodeDraft(t); setCodeError(null); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    editable={!savingCode}
                    placeholder="Enter code"
                    placeholderTextColor={Colors.gray}
                    onSubmitEditing={handleSaveCode}
                    onBlur={handleSaveCode}
                  />
                  {savingCode ? (
                    <ActivityIndicator size="small" color={Colors.gold} />
                  ) : (
                    <Pressable onPress={handleSaveCode} hitSlop={8}>
                      <Text style={styles.referralCheckmark}>✓</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.referralCode} numberOfLines={1}>{referralCode ?? currentUser.username}</Text>
                  <Pressable onPress={startEditingCode} hitSlop={8}>
                    <Text style={styles.referralEdit}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.referralCopyButton} onPress={handleCopyCode}>
                    <Text style={styles.referralCopyText}>Copy</Text>
                  </Pressable>
                </>
              )}
            </View>
            {codeError ? <Text style={styles.referralError}>{codeError}</Text> : null}
          </View>

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
            onPress={() => setActiveTab("liked")}
            style={[styles.tab, activeTab === "liked" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "liked" && styles.tabTextActive]}>Liked</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("saved")}
            style={[styles.tab, activeTab === "saved" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "saved" && styles.tabTextActive]}>Saved</Text>
          </Pressable>
        </View>

        {/* Post Grid */}
        {(activeTab === "saved" && savedLoading) || (activeTab === "liked" && likedLoading) ? (
          <View style={styles.emptyGrid}>
            <ActivityIndicator size="large" color={Colors.gold} />
          </View>
        ) : displayPosts.length > 0 ? (
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
                  <Pressable onPress={() => sharePost(post)} hitSlop={8}>
                    <Text style={styles.gridStatText}>  ↗</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyIcon}>
              {activeTab === "saved" ? "📌" : activeTab === "liked" ? "❤️" : "📷"}
            </Text>
            <Text style={styles.emptyTitle}>
              {activeTab === "saved"
                ? "No saved posts"
                : activeTab === "liked"
                ? "No liked posts yet"
                : "No posts yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "saved"
                ? "Save posts to revisit your favorite content"
                : activeTab === "liked"
                ? "Posts you like will appear here"
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
  referralInput: {
    flex: 1, fontSize: 16, fontWeight: "700", color: Colors.white, letterSpacing: 1,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    padding: 0,
  },
  referralEdit: { fontSize: 13, fontWeight: "600", color: Colors.gray },
  referralCheckmark: { fontSize: 18, fontWeight: "700", color: Colors.gold },
  referralCopyButton: {
    backgroundColor: Colors.gold, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  referralCopyText: { fontSize: 13, fontWeight: "700", color: Colors.black },
  referralError: { fontSize: 12, color: Colors.error, marginTop: 6 },
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
    flexDirection: "row", alignItems: "center", gap: 8,
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
  signInCta: {
    backgroundColor: Colors.gold, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 40,
  },
  signInCtaText: { fontSize: 15, fontWeight: "700", color: Colors.black, letterSpacing: 0.5 },
});
