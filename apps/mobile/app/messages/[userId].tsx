import { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, KeyboardAvoidingView,
  ActivityIndicator, Platform, StyleSheet, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../src/constants/colors";
import Avatar from "../../src/components/Avatar";
import { supabase } from "../../src/lib/supabase";
import { getRelativeTime } from "../../src/constants/mock-data";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  read: boolean;
}

interface OtherUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export default function MessageThreadScreen() {
  const { userId: otherUserId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // Load current user + other user info
  useEffect(() => {
    async function init() {
      const otherPromise = supabase
        .from("User")
        .select("id, username, displayName, avatarUrl")
        .eq("id", otherUserId)
        .single()
        .then(({ data: other }) => {
          if (other) {
            setOtherUser({
              id: (other as any).id,
              username: (other as any).username,
              displayName: (other as any).displayName || (other as any).username,
              avatarUrl: (other as any).avatarUrl ?? null,
            });
          }
        });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await otherPromise;
        setLoading(false);
        return;
      }

      const { data: me } = await supabase
        .from("User").select("id").eq("supabaseId", session.user.id).single();
      if (!me) {
        await otherPromise;
        setLoading(false);
        return;
      }
      setCurrentUserId((me as any).id);
      await otherPromise;
    }
    init();
  }, [otherUserId]);

  // Fetch messages
  const fetchMessages = useCallback(async (myId: string) => {
    const { data, error } = await supabase
      .from("Message")
      .select("id, senderId, content, createdAt, read")
      .or(
        `and(senderId.eq.${myId},recipientId.eq.${otherUserId}),` +
        `and(senderId.eq.${otherUserId},recipientId.eq.${myId})`
      )
      .order("createdAt", { ascending: true });

    if (!error && data) {
      setMessages(data as Message[]);
      // Mark incoming messages as read
      const unread = (data as Message[]).filter((m) => m.senderId === otherUserId && !m.read);
      if (unread.length > 0) {
        await supabase
          .from("Message")
          .update({ read: true })
          .in("id", unread.map((m) => m.id));
      }
    }
    setLoading(false);
  }, [otherUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    fetchMessages(currentUserId);

    // Real-time subscription
    const channel = supabase
      .channel(`messages-${currentUserId}-${otherUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Message",
          filter: `recipientId=eq.${currentUserId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (msg.senderId !== otherUserId) return;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
          // Mark as read immediately
          supabase.from("Message").update({ read: true }).eq("id", msg.id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUserId, otherUserId, fetchMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || sending) return;
    if (!currentUserId) {
      Alert.alert("Sign in required", "Sign in to send messages.");
      return;
    }
    setText("");
    setSending(true);

    // Message.id has no DB-side default (Prisma cuid is client-generated),
    // so we must supply an id explicitly or the insert fails.
    const msgId = "msg" + Math.random().toString(36).substring(2, 26);
    const now = new Date().toISOString();
    const tempMsg: Message = {
      id: msgId,
      senderId: currentUserId,
      content,
      createdAt: now,
      read: false,
    };
    setMessages((prev) => [...prev, tempMsg]);

    const { data, error } = await supabase
      .from("Message")
      .insert({ id: msgId, senderId: currentUserId, recipientId: otherUserId, content, createdAt: now })
      .select("id, senderId, content, createdAt, read")
      .single();

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      setText(content);
      Alert.alert("Message not sent", "Something went wrong. Please try again.");
    } else {
      setMessages((prev) => prev.map((m) => m.id === msgId ? (data as Message) : m));
    }
    setSending(false);
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.senderId === currentUserId;
    const prevMsg = index > 0 ? messages[index - 1] : null;
    const showTime = !prevMsg ||
      new Date(item.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 5 * 60 * 1000;

    return (
      <View>
        {showTime && (
          <Text style={styles.timeLabel}>{getRelativeTime(item.createdAt)}</Text>
        )}
        <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
          {!isMe && (
            <Avatar uri={otherUser?.avatarUrl ?? null} name={otherUser?.displayName ?? ""} size={28} />
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  };

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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Avatar uri={otherUser?.avatarUrl ?? null} name={otherUser?.displayName ?? ""} size={36} />
        <View style={styles.headerText}>
          <Text style={styles.headerName}>{otherUser?.displayName}</Text>
          <Text style={styles.headerUsername}>@{otherUser?.username}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👋</Text>
              <Text style={styles.emptyText}>Say hi to {otherUser?.displayName}</Text>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, inputFocused && styles.inputFocused]}
            value={text}
            onChangeText={setText}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Message..."
            placeholderTextColor={Colors.grayDark}
            multiline
            maxLength={1000}
            selectionColor={Colors.gold}
          />
          <Pressable
            style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={Colors.black} />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.black },
  flex: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: Colors.dark800, gap: 12,
  },
  backButton: { padding: 4 },
  backIcon: { fontSize: 22, color: Colors.gold },
  headerText: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "700", color: Colors.white },
  headerUsername: { fontSize: 12, color: Colors.grayDark },

  messagesList: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 8 },
  timeLabel: { textAlign: "center", fontSize: 11, color: Colors.grayDark, marginVertical: 12 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 6, gap: 8 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowThem: { justifyContent: "flex-start" },
  bubble: { maxWidth: "75%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: Colors.gold, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: Colors.dark800, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: Colors.black, fontWeight: "500" },
  bubbleTextThem: { color: Colors.white },

  emptyContainer: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: Colors.gray },

  inputRow: {
    flexDirection: "row", alignItems: "flex-end",
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 0.5, borderTopColor: Colors.dark800, gap: 10,
  },
  input: {
    flex: 1, backgroundColor: Colors.dark800, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    color: Colors.white, maxHeight: 120,
    borderWidth: 1, borderColor: Colors.dark700,
  },
  inputFocused: { borderColor: Colors.gold },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: Colors.dark700 },
  sendIcon: { fontSize: 18, fontWeight: "700", color: Colors.black },
});
