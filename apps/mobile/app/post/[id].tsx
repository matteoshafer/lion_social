import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Colors from "../../src/constants/colors";
import { getRelativeTime, formatCount } from "../../src/constants/mock-data";
import Avatar from "../../src/components/Avatar";
import PostTypeBadge from "../../src/components/PostTypeBadge";
import { supabase } from "../../src/lib/supabase";
import { sharePost } from "../../src/lib/share-post";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type PostData = {
  id: string;
  caption: string;
  imageUrl: string | null;
  type: "workout" | "meal" | "quote" | "story";
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isVerified: boolean;
  };
};

type CommentItem = {
  id: string;
  username: string;
  avatarUrl: string | null;
  text: string;
  createdAt: string;
};

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [localComments, setLocalComments] = useState<CommentItem[]>([]);
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>("you");
  const lastTapRef = useRef<number>(0);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const fetchPost = useCallback(async () => {
    const { data, error } = await supabase
      .from("Post")
      .select(`
        id, caption, imageUrl, type, createdAt,
        User!inner (id, username, avatarUrl),
        Like (id),
        Comment (id)
      `)
      .eq("id", id)
      .single();

    if (error || !data) {
      console.error("[PostDetail] fetchPost error:", error?.message);
      setLoading(false);
      return;
    }

    const p = data as any;
    const count = (p.Like as any[]).length;
    setLikesCount(count);
    setPost({
      id: p.id,
      caption: p.caption,
      imageUrl: p.imageUrl ?? null,
      type: p.type,
      createdAt: p.createdAt,
      likesCount: count,
      commentsCount: (p.Comment as any[]).length,
      user: {
        id: p.User.id,
        username: p.User.username,
        displayName: p.User.username,
        avatarUrl: p.User.avatarUrl ?? null,
        isVerified: false,
      },
    });
    setLoading(false);
  }, [id]);

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from("Comment")
      .select(`
        id, content, createdAt,
        User!inner (id, username, avatarUrl)
      `)
      .eq("postId", id)
      .order("createdAt", { ascending: true });

    if (error || !data) {
      console.error("[PostDetail] fetchComments error:", error?.message);
      return;
    }

    setLocalComments(
      (data as any[]).map((c) => ({
        id: c.id,
        username: c.User.username,
        avatarUrl: c.User.avatarUrl ?? null,
        text: c.content,
        createdAt: c.createdAt,
      }))
    );
  }, [id]);

  // Record view + load data on mount.
  // Session is fetched once, then post data and like/save status load in parallel.
  useEffect(() => {
    supabase.rpc("increment_post_view", { post_id: id }).then(({ error }) => {
      if (error) console.error("[PostDetail] increment_post_view error:", error.message);
      else console.log("[PostDetail] View recorded for:", id);
    });

    fetchComments();

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        fetchPost();
        return;
      }
      const { data: appUser } = await supabase
        .from("User")
        .select("id, username")
        .eq("supabaseId", session.user.id)
        .single();
      if (!appUser) {
        fetchPost();
        return;
      }
      const uid = (appUser as any).id;
      setAppUserId(uid);
      setCurrentUsername((appUser as any).username);
      const [, { data: like }, { data: save }] = await Promise.all([
        fetchPost(),
        supabase.from("Like").select("id").eq("postId", id).eq("userId", uid).maybeSingle(),
        supabase.from("Save").select("id").eq("postId", id).eq("userId", uid).maybeSingle(),
      ]);
      setIsLiked(!!like);
      setIsSaved(!!save);
    })();
  }, [id, fetchPost, fetchComments]);

  const handleLike = useCallback(async () => {
    if (!appUserId) return;
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikesCount((prev) => wasLiked ? prev - 1 : prev + 1);

    if (wasLiked) {
      const { error } = await supabase.from("Like").delete().eq("postId", id).eq("userId", appUserId);
      if (error) { setIsLiked(wasLiked); setLikesCount((prev) => prev + 1); }
    } else {
      const now = new Date().toISOString();
      const { error } = await supabase.from("Like").insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: id, userId: appUserId, createdAt: now });
      if (error) {
        if (error.code === "23505") { setIsLiked(true); setLikesCount((prev) => prev - 1); }
        else { setIsLiked(wasLiked); setLikesCount((prev) => prev - 1); }
      }
    }
  }, [isLiked, appUserId, id]);

  const handleSave = useCallback(async () => {
    if (!appUserId) return;
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    if (wasSaved) {
      const { error } = await supabase.from("Save").delete().eq("postId", id).eq("userId", appUserId);
      if (error) setIsSaved(wasSaved);
    } else {
      const now = new Date().toISOString();
      const { error } = await supabase.from("Save").insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: id, userId: appUserId, createdAt: now, updatedAt: now });
      if (error) setIsSaved(wasSaved);
    }
  }, [isSaved, appUserId, id]);

  const handleShare = useCallback(() => {
    if (post) sharePost(post);
  }, [post]);

  const showHeartBurst = useCallback(() => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }),
      Animated.delay(400),
      Animated.timing(heartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [heartScale, heartOpacity]);

  const handleImageDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (!isLiked) handleLike();
      showHeartBurst();
    } else {
      lastTapRef.current = now;
    }
  }, [isLiked, handleLike, showHeartBurst]);

  const handleCommentSubmit = useCallback(async () => {
    const text = commentText.trim();
    if (!text) return;
    setCommentText("");

    const tempComment: CommentItem = {
      id: `temp-${Date.now()}`,
      username: currentUsername,
      avatarUrl: null,
      text,
      createdAt: new Date().toISOString(),
    };
    setLocalComments((prev) => [...prev, tempComment]);

    if (!appUserId) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("Comment")
      .insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: id, userId: appUserId, content: text, createdAt: now, updatedAt: now });

    if (error) {
      console.error("[PostDetail] Comment insert error:", error.message);
      setLocalComments((prev) => prev.filter((c) => c.id !== tempComment.id));
      setCommentText(text);
    }
  }, [commentText, appUserId, id, currentUsername]);

  if (loading || !post) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Author row */}
          <View style={styles.authorRow}>
            <Pressable style={styles.authorInfo} onPress={() => router.push(`/user/${post.user.id}`)}>
              <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size={44} />
              <View style={styles.authorText}>
                <View style={styles.usernameRow}>
                  <Text style={styles.username}>{post.user.username}</Text>
                  {post.user.isVerified && (
                    <View style={styles.verifiedDot}>
                      <Text style={styles.verifiedText}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.timestamp}>{getRelativeTime(post.createdAt)}</Text>
              </View>
            </Pressable>
            <PostTypeBadge type={post.type} />
          </View>

          {/* Image */}
          {post.imageUrl && (
            <Pressable onPress={handleImageDoubleTap} style={styles.imageWrapper}>
              <Image
                source={{ uri: post.imageUrl }}
                style={styles.postImage}
                resizeMode="cover"
              />
              <Animated.Text style={[styles.heartBurst, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}>
                ♥
              </Animated.Text>
            </Pressable>
          )}

          {/* Caption */}
          <View style={styles.captionContainer}>
            <Text style={styles.caption}>{post.caption}</Text>
          </View>

          {/* Action row */}
          <View style={styles.actionRow}>
            <View style={styles.actionLeft}>
              <Pressable onPress={handleLike} style={styles.actionButton}>
                <Text style={[styles.actionIcon, isLiked && styles.actionIconLiked]}>
                  {isLiked ? "♥" : "♡"}
                </Text>
                <Text style={[styles.actionCount, isLiked && styles.actionCountLiked]}>
                  {formatCount(likesCount)}
                </Text>
              </Pressable>
              <View style={styles.actionButton}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionCount}>{formatCount(localComments.length)}</Text>
              </View>
            </View>
            <View style={styles.actionRight}>
              <Pressable style={styles.actionButton} onPress={handleShare}>
                <Text style={styles.actionIcon}>↗</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, isSaved && styles.actionButtonSaved]} onPress={handleSave}>
                <Text style={styles.actionIcon}>🔖</Text>
              </Pressable>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Comments section */}
          <Text style={styles.commentsHeading}>
            {localComments.length > 0
              ? `${localComments.length} Comments`
              : "No comments yet"}
          </Text>

          {localComments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Avatar uri={c.avatarUrl} name={c.username} size={36} />
              <View style={styles.commentBubble}>
                <Text style={styles.commentUsername}>{c.username}</Text>
                <Text style={styles.commentText}>{c.text}</Text>
                <Text style={styles.commentTime}>{getRelativeTime(c.createdAt)}</Text>
              </View>
            </View>
          ))}

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Comment input */}
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment…"
            placeholderTextColor={Colors.grayDark}
            value={commentText}
            onChangeText={setCommentText}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleCommentSubmit}
          />
          {commentText.trim().length > 0 && (
            <Pressable style={styles.sendButton} onPress={handleCommentSubmit}>
              <Text style={styles.sendText}>Post</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark800,
  },
  backButton: {
    width: 36,
    alignItems: "center",
  },
  backIcon: {
    fontSize: 22,
    color: Colors.gold,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.white,
  },

  // Author
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  authorInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  authorText: { flex: 1 },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  username: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.white,
  },
  verifiedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.black,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.grayDark,
    marginTop: 1,
  },

  // Post content
  imageWrapper: { position: "relative" },
  postImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
  },
  heartBurst: {
    position: "absolute",
    alignSelf: "center",
    top: "30%",
    fontSize: 90,
    color: "#EF4444",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  captionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  caption: {
    fontSize: 15,
    color: Colors.grayLight,
    lineHeight: 23,
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  actionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  actionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  actionButtonSaved: {
    backgroundColor: "rgba(250, 204, 21, 0.15)",
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  actionIcon: {
    fontSize: 22,
    color: Colors.grayLight,
  },
  actionIconLiked: { color: "#EF4444" },
  actionCount: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.gray,
  },
  actionCountLiked: { color: "#EF4444" },

  // Comments
  divider: {
    height: 0.5,
    backgroundColor: Colors.dark800,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  commentsHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.white,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  commentRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
    alignItems: "flex-start",
  },
  commentBubble: {
    flex: 1,
    backgroundColor: Colors.dark900,
    borderRadius: 12,
    padding: 10,
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.white,
    marginBottom: 3,
  },
  commentText: {
    fontSize: 14,
    color: Colors.grayLight,
    lineHeight: 20,
  },
  commentTime: {
    fontSize: 11,
    color: Colors.grayDark,
    marginTop: 4,
  },

  // Comment input
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: Colors.dark800,
    backgroundColor: Colors.black,
    gap: 10,
  },
  commentInput: {
    flex: 1,
    height: 40,
    backgroundColor: Colors.dark900,
    borderRadius: 20,
    paddingHorizontal: 16,
    fontSize: 14,
    color: Colors.white,
    borderWidth: 0.5,
    borderColor: Colors.dark700,
  },
  sendButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.gold,
    borderRadius: 16,
  },
  sendText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.black,
  },
});
