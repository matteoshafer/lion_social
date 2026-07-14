import { useState, useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, FlatList, Pressable, TextInput,
  RefreshControl, ActivityIndicator, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import Avatar from "../../src/components/Avatar";
import { supabase } from "../../src/lib/supabase";
import { getRelativeTime } from "../../src/constants/mock-data";

interface Conversation {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface GroupItem {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string;
  lastMessageAt: string;
}

interface UserResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

async function fetchConversations(currentUserId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("Message")
    .select(`
      id, content, createdAt, read, senderId, recipientId,
      sender:User!senderId (id, username, displayName, avatarUrl),
      recipient:User!recipientId (id, username, displayName, avatarUrl)
    `)
    .or(`senderId.eq.${currentUserId},recipientId.eq.${currentUserId}`)
    .order("createdAt", { ascending: false });

  if (error || !data) return [];

  const convMap = new Map<string, Conversation>();
  for (const msg of data as any[]) {
    const other = msg.senderId === currentUserId ? msg.recipient : msg.sender;
    if (!other || convMap.has(other.id)) continue;
    const unreadCount = (data as any[]).filter(
      (m) => m.senderId === other.id && m.recipientId === currentUserId && !m.read
    ).length;
    convMap.set(other.id, {
      userId: other.id,
      username: other.username,
      displayName: other.displayName || other.username,
      avatarUrl: other.avatarUrl ?? null,
      lastMessage: msg.content || "Sent a message",
      lastMessageAt: msg.createdAt,
      unreadCount,
    });
  }
  return Array.from(convMap.values());
}

async function fetchGroups(currentUserId: string): Promise<GroupItem[]> {
  const { data: memberships, error } = await supabase
    .from("GroupMember")
    .select("groupId, GroupChat!groupId (id, name, createdAt)")
    .eq("userId", currentUserId);

  if (error || !memberships?.length) return [];

  const groupIds = (memberships as any[]).map((m) => m.groupId);

  const { data: memberCounts } = await supabase
    .from("GroupMember")
    .select("groupId")
    .in("groupId", groupIds);

  const groups: GroupItem[] = [];
  for (const m of memberships as any[]) {
    const gc = m.GroupChat;
    if (!gc) continue;

    const { data: lastMsgArr } = await supabase
      .from("GroupMessage")
      .select("content, createdAt, User!senderId (username)")
      .eq("groupId", m.groupId)
      .order("createdAt", { ascending: false })
      .limit(1);

    const lastMsg = lastMsgArr?.[0] as any;
    const count = (memberCounts || []).filter((mc: any) => mc.groupId === m.groupId).length;

    groups.push({
      id: gc.id,
      name: gc.name,
      memberCount: count,
      lastMessage: lastMsg
        ? `${lastMsg.User?.username}: ${lastMsg.content}`
        : "No messages yet",
      lastMessageAt: lastMsg?.createdAt ?? gc.createdAt,
    });
  }

  return groups.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

async function searchUsers(query: string, currentUserId: string): Promise<UserResult[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from("User")
    .select("id, username, displayName, avatarUrl")
    .ilike("username", `%${query.trim()}%`)
    .neq("id", currentUserId)
    .limit(10);
  if (error || !data) return [];
  return (data as any[]).map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    avatarUrl: u.avatarUrl ?? null,
  }));
}

export default function MessagesScreen() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dms" | "groups">("dms");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCurrentUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase
      .from("User").select("id").eq("supabaseId", session.user.id).single();
    return (data as any)?.id ?? null;
  }, []);

  const loadAll = useCallback(async (userId: string) => {
    const [convs, grps] = await Promise.all([
      fetchConversations(userId),
      fetchGroups(userId),
    ]);
    setConversations(convs);
    setGroups(grps);
    setLoading(false);
  }, []);

  // Reload every time the tab regains focus so unread badges stay accurate
  // after reading a conversation.
  useFocusEffect(
    useCallback(() => {
      if (currentUserId) {
        loadAll(currentUserId);
        return;
      }
      loadCurrentUser().then((id) => {
        if (!id) { setLoading(false); return; }
        setCurrentUserId(id);
        loadAll(id);
      });
    }, [currentUserId, loadAll, loadCurrentUser])
  );

  // Realtime: refresh the inbox when a new message addressed to us arrives.
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`inbox-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Message",
          filter: `recipientId=eq.${currentUserId}`,
        },
        () => { loadAll(currentUserId); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, loadAll]);

  useEffect(() => {
    if (!searchQuery.trim() || !currentUserId) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const results = await searchUsers(searchQuery, currentUserId);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId]);

  const onRefresh = useCallback(async () => {
    if (!currentUserId) return;
    setRefreshing(true);
    await loadAll(currentUserId);
    setRefreshing(false);
  }, [currentUserId, loadAll]);

  const showSearch = activeTab === "dms" && searchQuery.trim().length > 0;

  const renderConversation = ({ item }: { item: Conversation }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/messages/${item.userId}`)}>
      <View style={styles.avatarWrapper}>
        <Avatar uri={item.avatarUrl} name={item.displayName} size={52} />
        {item.unreadCount > 0 && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName}>{item.displayName}</Text>
          <Text style={styles.rowTime}>{getRelativeTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text
            style={[styles.rowLastMsg, item.unreadCount > 0 && styles.rowLastMsgUnread]}
            numberOfLines={1}
          >
            {item.lastMessage}
          </Text>
          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );

  const renderGroup = ({ item }: { item: GroupItem }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/group/${item.id}`)}>
      <View style={styles.groupAvatarContainer}>
        <Text style={styles.groupAvatarIcon}>👥</Text>
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowTime}>{getRelativeTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.rowLastMsg} numberOfLines={1}>{item.lastMessage}</Text>
          <Text style={styles.memberCount}>{item.memberCount} members</Text>
        </View>
      </View>
    </Pressable>
  );

  const renderSearchResult = ({ item }: { item: UserResult }) => (
    <Pressable style={styles.row} onPress={() => router.push(`/messages/${item.id}`)}>
      <Avatar uri={item.avatarUrl} name={item.displayName || item.username} size={44} />
      <View style={[styles.rowContent, { marginLeft: 12 }]}>
        <Text style={styles.rowName}>{item.displayName || item.username}</Text>
        <Text style={styles.rowTime}>@{item.username}</Text>
      </View>
      <Text style={styles.messageAction}>Message</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        {activeTab === "groups" && (
          <Pressable style={styles.newGroupBtn} onPress={() => router.push("/create-group")}>
            <Text style={styles.newGroupText}>+ New Group</Text>
          </Pressable>
        )}
      </View>

      {/* DM / Groups Toggle */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "dms" && styles.tabActive]}
          onPress={() => { setActiveTab("dms"); setSearchQuery(""); }}
        >
          <Text style={[styles.tabText, activeTab === "dms" && styles.tabTextActive]}>Direct Messages</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "groups" && styles.tabActive]}
          onPress={() => { setActiveTab("groups"); setSearchQuery(""); }}
        >
          <Text style={[styles.tabText, activeTab === "groups" && styles.tabTextActive]}>Groups</Text>
        </Pressable>
      </View>

      {/* DM Search */}
      {activeTab === "dms" && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search people..."
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
      )}

      {showSearch ? (
        <FlatList
          data={searchResults}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      ) : activeTab === "dms" ? (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.dark800} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>Search for someone above to start a conversation</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroup}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={Colors.gold} colors={[Colors.gold]} progressBackgroundColor={Colors.dark800} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptySubtitle}>Tap "+ New Group" to create one</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.white, letterSpacing: 0.5 },
  newGroupBtn: {
    backgroundColor: Colors.gold, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  newGroupText: { fontSize: 13, fontWeight: "700", color: Colors.black },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark700,
    marginHorizontal: 20, marginTop: 8,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.gold },
  tabText: { fontSize: 14, fontWeight: "600", color: Colors.gray },
  tabTextActive: { color: Colors.gold },
  searchContainer: { paddingHorizontal: 20, paddingVertical: 12 },
  searchBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.dark800,
    borderRadius: 14, paddingHorizontal: 16, height: 48,
    borderWidth: 1, borderColor: Colors.dark700,
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.white },
  clearButton: { fontSize: 14, color: Colors.gray, padding: 4 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 100 },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark800,
  },
  avatarWrapper: { position: "relative", marginRight: 14 },
  unreadDot: {
    position: "absolute", top: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.gold, borderWidth: 2, borderColor: Colors.black,
  },
  groupAvatarContainer: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.dark800, alignItems: "center", justifyContent: "center",
    marginRight: 14, borderWidth: 1, borderColor: Colors.dark700,
  },
  groupAvatarIcon: { fontSize: 24 },
  rowContent: { flex: 1 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rowName: { fontSize: 15, fontWeight: "700", color: Colors.white },
  rowTime: { fontSize: 12, color: Colors.grayDark },
  rowBottom: { flexDirection: "row", alignItems: "center" },
  rowLastMsg: { flex: 1, fontSize: 14, color: Colors.gray },
  rowLastMsgUnread: { color: Colors.grayLight, fontWeight: "600" },
  unreadBadge: {
    backgroundColor: Colors.gold, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: "700", color: Colors.black },
  memberCount: { fontSize: 12, color: Colors.grayDark, marginLeft: 8 },
  messageAction: { fontSize: 13, fontWeight: "600", color: Colors.gold },
  emptyContainer: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: Colors.white, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.gray, textAlign: "center", lineHeight: 21 },
  emptyText: { fontSize: 15, color: Colors.gray },
});
