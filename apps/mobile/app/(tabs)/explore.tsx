import { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Image,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors, { PostTypeColors } from "../../src/constants/colors";
import { CATEGORIES, type MockPost } from "../../src/constants/mock-data";
import { supabase } from "../../src/lib/supabase";
import Avatar from "../../src/components/Avatar";
import { sharePost } from "../../src/lib/share-post";

interface UserSearchResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

async function fetchExplorePosts(currentUserId?: string | null): Promise<MockPost[]> {
  const { data, error } = await supabase
    .from("Post")
    .select(`
      id, caption, imageUrl, type, createdAt,
      User!inner (id, username, avatarUrl),
      Like (id, userId),
      Comment (id)
    `)
    .order("createdAt", { ascending: false })
    .limit(60);

  if (error || !data) return [];

  return (data as any[]).map((p) => ({
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
    likesCount: (p.Like as any[]).length,
    commentsCount: (p.Comment as any[]).length,
    isLiked: currentUserId ? (p.Like as any[]).some((l: any) => l.userId === currentUserId) : false,
    createdAt: p.createdAt,
  }));
}

export default function ExploreScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [posts, setPosts] = useState<MockPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const lastTapRef = useRef<Map<string, number>>(new Map());

  // Live user search: debounce 300ms, prefix-match on username
  useEffect(() => {
    if (!searchQuery) {
      setUserResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from("User")
        .select("id, username, displayName, avatarUrl")
        .ilike("username", `${searchQuery}%`)
        .limit(8);
      if (!cancelled) {
        setUserResults(error || !data ? [] : (data as UserSearchResult[]));
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data: appUser } = await supabase.from("User").select("id").eq("supabaseId", session.user.id).single();
      if (appUser) setAppUserId((appUser as any).id);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await fetchExplorePosts(appUserId);
      if (!cancelled) { setPosts(result); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [appUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await fetchExplorePosts(appUserId);
    setPosts(result);
    setRefreshing(false);
  }, [appUserId]);

  const handleGridTap = useCallback((item: MockPost) => {
    const now = Date.now();
    const last = lastTapRef.current.get(item.id) ?? 0;
    if (now - last < 300) {
      // Double-tap: like
      lastTapRef.current.set(item.id, 0);
      if (!appUserId) return;
      const isLiked = item.isLiked;
      setPosts((prev) => prev.map((p) => p.id === item.id
        ? { ...p, isLiked: !isLiked, likesCount: p.likesCount + (isLiked ? -1 : 1) }
        : p
      ));
      if (isLiked) {
        supabase.from("Like").delete().eq("postId", item.id).eq("userId", appUserId)
          .then(({ error }) => { if (error) { Alert.alert("Like error", error.message); setPosts((prev) => prev.map((p) => p.id === item.id ? { ...p, isLiked: true, likesCount: p.likesCount + 1 } : p)); } });
      } else {
        const now2 = new Date().toISOString();
        supabase.from("Like").insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: item.id, userId: appUserId, createdAt: now2 })
          .then(({ error }) => { if (error) { setPosts((prev) => prev.map((p) => p.id === item.id ? { ...p, isLiked: error.code === "23505" ? true : item.isLiked, likesCount: p.likesCount - 1 } : p)); } });
      }
    } else {
      lastTapRef.current.set(item.id, now);
      setTimeout(() => {
        if (Date.now() - (lastTapRef.current.get(item.id) ?? 0) >= 300) {
          router.push(`/post/${item.id}`);
        }
      }, 300);
    }
  }, [appUserId, router]);

  const filteredPosts = posts.filter((p) => {
    const matchesCategory = !activeCategory || p.type === activeCategory;
    const matchesSearch =
      !searchQuery ||
      p.caption.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.user.username.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const trendingPosts = posts.slice(0, 3);

  const renderTrendingCard = ({ item }: { item: MockPost }) => (
    <Pressable style={styles.trendingCard} onPress={() => handleGridTap(item)}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.trendingImage} resizeMode="cover" />
      ) : (
        <View style={[styles.trendingImage, styles.trendingPlaceholder]}>
          <Text style={styles.trendingQuoteIcon}>"</Text>
        </View>
      )}
      <View style={styles.trendingOverlay}>
        <View style={[styles.trendingBadge, { backgroundColor: PostTypeColors[item.type] }]}>
          <Text style={styles.trendingBadgeText}>{item.type}</Text>
        </View>
        <Text style={styles.trendingCaption} numberOfLines={2}>{item.caption}</Text>
        <View style={styles.trendingStats}>
          <Text style={styles.trendingStatText}>{item.likesCount} likes</Text>
        </View>
      </View>
    </Pressable>
  );

  const renderGridItem = ({ item, index }: { item: MockPost; index: number }) => (
    <Pressable
      style={[
        styles.gridItem,
        { marginRight: (index + 1) % GRID_COLUMNS === 0 ? 0 : GRID_GAP, marginBottom: GRID_GAP },
      ]}
      onPress={() => handleGridTap(item)}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.gridImage} resizeMode="cover" />
      ) : (
        <View style={[styles.gridImage, styles.gridPlaceholder]}>
          <Text style={styles.gridQuoteText} numberOfLines={4}>{item.caption}</Text>
        </View>
      )}
      <View style={styles.gridOverlay}>
        <View style={styles.gridStats}>
          <Text style={styles.gridStatText}>♥ {item.likesCount}</Text>
          <Pressable onPress={() => sharePost(item)} hitSlop={8}>
            <Text style={[styles.gridStatText, { marginLeft: 6 }]}>↗</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Explore</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search posts, people, tags..."
              placeholderTextColor={Colors.grayDark}
              value={searchQuery}
              onChangeText={setSearchQuery}
              selectionColor={Colors.gold}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Text style={styles.clearButton}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* People Section (live user search results) */}
        {userResults.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>People</Text>
            </View>
            {userResults.map((user) => (
              <Pressable
                key={user.id}
                style={styles.userRow}
                onPress={() => router.push(`/user/${user.id}`)}
              >
                <Avatar uri={user.avatarUrl} name={user.displayName || user.username} size={44} />
                <View style={styles.userRowInfo}>
                  <Text style={styles.userRowUsername}>@{user.username}</Text>
                  {!!user.displayName && (
                    <Text style={styles.userRowDisplayName}>{user.displayName}</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Trending Section */}
        {trendingPosts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trending</Text>
            </View>
            <FlatList
              data={trendingPosts}
              renderItem={renderTrendingCard}
              keyExtractor={(item) => `trending-${item.id}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingList}
              snapToInterval={SCREEN_WIDTH * 0.75 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {/* Category Pills */}
        <View style={styles.section}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryContainer}
          >
            <Pressable
              onPress={() => setActiveCategory(null)}
              style={[styles.categoryPill, activeCategory === null && styles.categoryPillActive]}
            >
              <Text style={[styles.categoryText, activeCategory === null && styles.categoryTextActive]}>
                All
              </Text>
            </Pressable>
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                style={[
                  styles.categoryPill,
                  activeCategory === cat.id && styles.categoryPillActive,
                  activeCategory === cat.id && {
                    borderColor: PostTypeColors[cat.id],
                    backgroundColor: `${PostTypeColors[cat.id]}20`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    activeCategory === cat.id && { color: PostTypeColors[cat.id] },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Posts Grid */}
        <View style={styles.gridContainer}>
          {filteredPosts.map((post, index) => (
            <View key={post.id}>
              {renderGridItem({ item: post, index })}
            </View>
          ))}
        </View>

        {filteredPosts.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>
              {searchQuery.length > 0 && userResults.length === 0
                ? `No results found for "${searchQuery}"`
                : "No posts found"}
            </Text>
            <Text style={styles.emptySubtitle}>Try a different search or category</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.white, letterSpacing: 0.5 },
  searchContainer: { paddingHorizontal: 20, paddingVertical: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark800,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.dark700,
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.white, height: 48 },
  clearButton: { fontSize: 14, color: Colors.gray, padding: 4 },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: Colors.white },
  trendingList: { paddingHorizontal: 20, gap: 12 },
  trendingCard: {
    width: SCREEN_WIDTH * 0.75,
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.dark800,
  },
  trendingImage: { width: "100%", height: "100%" },
  trendingPlaceholder: { backgroundColor: Colors.dark700, alignItems: "center", justifyContent: "center" },
  trendingQuoteIcon: { fontSize: 80, color: Colors.goldMuted, fontWeight: "700" },
  trendingOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 16, backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
  trendingBadge: {
    alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8, marginBottom: 6,
  },
  trendingBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.5 },
  trendingCaption: { fontSize: 14, fontWeight: "600", color: Colors.white, lineHeight: 20 },
  trendingStats: { marginTop: 6 },
  trendingStatText: { fontSize: 12, color: Colors.grayLight },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 12,
  },
  userRowInfo: { flex: 1 },
  userRowUsername: { fontSize: 15, fontWeight: "600", color: Colors.white },
  userRowDisplayName: { fontSize: 13, color: Colors.gray, marginTop: 1 },
  categoryContainer: { paddingHorizontal: 20, gap: 8 },
  categoryPill: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24,
    backgroundColor: Colors.dark800, borderWidth: 1, borderColor: Colors.dark700,
  },
  categoryPillActive: { borderColor: Colors.gold, backgroundColor: Colors.goldMuted },
  categoryText: { fontSize: 14, fontWeight: "600", color: Colors.gray },
  categoryTextActive: { color: Colors.gold },
  gridContainer: { flexDirection: "row", flexWrap: "wrap", paddingBottom: 100 },
  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, overflow: "hidden" },
  gridImage: { width: "100%", height: "100%" },
  gridPlaceholder: { backgroundColor: Colors.dark800, padding: 12, justifyContent: "center" },
  gridQuoteText: { fontSize: 12, color: Colors.grayLight, lineHeight: 18, fontStyle: "italic" },
  gridOverlay: { position: "absolute", bottom: 8, right: 8 },
  gridStats: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  gridStatText: { fontSize: 11, color: Colors.white, fontWeight: "600" },
  emptyContainer: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40, paddingBottom: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: Colors.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.gray, textAlign: "center" },
});
