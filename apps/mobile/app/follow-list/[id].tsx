import { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable,
  ActivityIndicator, StyleSheet, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import Avatar from "../../src/components/Avatar";
import { supabase } from "../../src/lib/supabase";

interface FollowUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

async function fetchList(userId: string, type: "followers" | "following"): Promise<FollowUser[]> {
  if (type === "followers") {
    // People who follow userId → Follow.followerId
    const { data, error } = await supabase
      .from("Follow")
      .select("follower:User!followerId (id, username, displayName, avatarUrl)")
      .eq("followingId", userId)
      .order("createdAt", { ascending: false });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      id: r.follower.id,
      username: r.follower.username,
      displayName: r.follower.displayName ?? r.follower.username,
      avatarUrl: r.follower.avatarUrl ?? null,
    }));
  } else {
    // People userId follows → Follow.followingId
    const { data, error } = await supabase
      .from("Follow")
      .select("following:User!followingId (id, username, displayName, avatarUrl)")
      .eq("followerId", userId)
      .order("createdAt", { ascending: false });
    if (error || !data) return [];
    return (data as any[]).map((r) => ({
      id: r.following.id,
      username: r.following.username,
      displayName: r.following.displayName ?? r.following.username,
      avatarUrl: r.following.avatarUrl ?? null,
    }));
  }
}

export default function FollowListScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type: "followers" | "following" }>();
  const router = useRouter();
  const listType: "followers" | "following" = type === "following" ? "following" : "followers";

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchList(id, listType);
    setUsers(result);
    setLoading(false);
  }, [id, listType]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderItem = ({ item }: { item: FollowUser }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/user/${item.id}`)}>
      <Avatar uri={item.avatarUrl} name={item.displayName} size={48} />
      <View style={styles.rowText}>
        <Text style={styles.displayName}>{item.displayName}</Text>
        <Text style={styles.username}>@{item.username}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {listType === "followers" ? "Followers" : "Following"}
        </Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {listType === "followers" ? "No followers yet" : "Not following anyone yet"}
              </Text>
            </View>
          }
          contentContainerStyle={users.length === 0 && styles.emptyContainer}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark800,
  },
  backButton: { width: 36, alignItems: "center" },
  backIcon: { fontSize: 22, color: Colors.gold, fontWeight: "600" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyContainer: { flex: 1 },
  emptyText: { fontSize: 15, color: Colors.gray },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowText: { flex: 1 },
  displayName: { fontSize: 15, fontWeight: "700", color: Colors.white },
  username: { fontSize: 13, color: Colors.gray, marginTop: 2 },
  chevron: { fontSize: 20, color: Colors.grayDark },
  separator: { height: 0.5, backgroundColor: Colors.dark800, marginLeft: 76 },
});
