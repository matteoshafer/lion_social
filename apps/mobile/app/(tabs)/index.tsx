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

async function fetchCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data: appUser } = await supabase
    .from("User")
    .select("id")
    .eq("supabaseId", session.user.id)
    .single();
  return (appUser as any)?.id ?? null;
}

async function fetchFeedPosts(currentUserId: string | null): Promise<MockPost[]> {
  const { data, error } = await supabase
    .from("Post")
    .select(`
      id, caption, imageUrl, type, createdAt,
      User!inner (id, username, avatarUrl),
      Like (id, userId),
      Comment (id)
    `)
    .order("createdAt", { ascending: false })
    .limit(30);

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
    likesCount: p.Like.length,
    commentsCount: p.Comment.length,
    isLiked: currentUserId
      ? p.Like.some((l: any) => l.userId === currentUserId)
      : false,
    createdAt: p.createdAt,
  }));
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
      const uid = await fetchCurrentUserId();
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
      <Pressable style={styles.messagesButton} onPress={() => router.push("/(tabs)/messages")}>
        <Text style={styles.messagesIcon}>💬</Text>
      </Pressable>
    </View>
  );

  const renderPost = ({ item }: { item: MockPost }) => (
    <PostCard post={item} currentUserId={currentUserId} />
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
