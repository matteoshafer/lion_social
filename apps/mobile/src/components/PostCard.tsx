import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  Modal,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { supabase } from "../lib/supabase";
import { getAppUserId } from "../lib/auth";
import { type MockPost, getRelativeTime, formatCount } from "../constants/mock-data";
import Avatar from "./Avatar";
import PostTypeBadge from "./PostTypeBadge";
import { sharePost } from "../lib/share-post";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PostCardProps {
  post: MockPost;
  currentUserId?: string | null;
  /** Save state resolved by the parent (e.g. included in the feed query).
   *  When provided, PostCard skips its own Save lookup entirely. */
  initialSaved?: boolean;
  onBlock?: (blockedUserId: string) => void;
  onDelete?: () => void;
}

const REPORT_REASONS = ["Spam", "Inappropriate content", "Harassment", "False information", "Other"];

export default function PostCard({ post, currentUserId, initialSaved, onBlock, onDelete }: PostCardProps) {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isSaved, setIsSaved] = useState(initialSaved ?? false);
  const [appUserId, setAppUserId] = useState<string | null>(currentUserId ?? null);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportReasons, setShowReportReasons] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<number>(0);
  const pendingNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  // Sync from parent when post data changes (e.g. after navigating back to feed)
  useEffect(() => {
    setIsLiked(post.isLiked);
    setLikesCount(post.likesCount);
  }, [post.isLiked, post.likesCount]);

  useEffect(() => {
    if (initialSaved !== undefined) setIsSaved(initialSaved);
  }, [initialSaved]);

  useEffect(() => {
    const uid = currentUserId ?? null;
    if (uid) {
      setAppUserId(uid);
      // Save state comes from the parent's feed query when available —
      // only fall back to a per-card lookup if the parent didn't provide it.
      if (initialSaved === undefined) {
        supabase.from("Save").select("id").eq("postId", post.id).eq("userId", uid).maybeSingle()
          .then(({ data }) => setIsSaved(!!data));
      }
    } else {
      // Fallback: resolve the app user via the shared session cache
      getAppUserId().then(async (appUserIdResolved) => {
        if (!appUserIdResolved) return;
        setAppUserId(appUserIdResolved);
        const [{ data: like }, { data: save }] = await Promise.all([
          supabase.from("Like").select("id").eq("postId", post.id).eq("userId", appUserIdResolved).maybeSingle(),
          supabase.from("Save").select("id").eq("postId", post.id).eq("userId", appUserIdResolved).maybeSingle(),
        ]);
        setIsLiked(!!like);
        setIsSaved(!!save);
      });
    }
  }, [post.id, currentUserId, initialSaved]);

  const handleSave = async () => {
    if (!appUserId) return;
    const wasSaved = isSaved;
    setIsSaved(!wasSaved);
    if (wasSaved) {
      const { error } = await supabase.from("Save").delete().eq("postId", post.id).eq("userId", appUserId);
      if (error) setIsSaved(wasSaved);
    } else {
      const now = new Date().toISOString();
      const { error } = await supabase.from("Save").insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: post.id, userId: appUserId, createdAt: now, updatedAt: now });
      if (error) setIsSaved(wasSaved);
    }
  };

  const handleLike = async () => {
    if (!appUserId) return;
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikesCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    if (wasLiked) {
      const { error } = await supabase.from("Like").delete().eq("postId", post.id).eq("userId", appUserId);
      if (error) { setIsLiked(wasLiked); setLikesCount((prev) => prev + 1); }
    } else {
      const now = new Date().toISOString();
      const { error } = await supabase.from("Like").insert({ id: "c" + Math.random().toString(36).substring(2, 26), postId: post.id, userId: appUserId, createdAt: now });
      if (error) {
        if (error.code === "23505") { setIsLiked(true); setLikesCount((prev) => prev - 1); }
        else { setIsLiked(wasLiked); setLikesCount((prev) => prev - 1); }
      }
    }
  };

  const handleShare = () => sharePost(post);

  const handleReport = async (reason: string) => {
    setShowReportReasons(false);
    setShowMenu(false);
    if (!appUserId) return;
    await supabase.from("Report").insert({
      id: "rep" + Math.random().toString(36).substring(2, 24),
      reporterId: appUserId,
      targetType: "post",
      targetId: post.id,
      reason,
      createdAt: new Date().toISOString(),
    });
    showToast("Thanks for reporting");
  };

  const handleBlock = () => {
    setShowMenu(false);
    Alert.alert(
      `Block @${post.user.username}?`,
      "They won't be able to see your posts and you won't see theirs.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block", style: "destructive",
          onPress: async () => {
            if (!appUserId) return;
            await supabase.from("Block").insert({
              id: "blk" + Math.random().toString(36).substring(2, 24),
              blockerId: appUserId,
              blockedId: post.user.id,
              createdAt: new Date().toISOString(),
            });
            onBlock?.(post.user.id);
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await supabase.from("Post").delete().eq("id", post.id);
          onDelete?.();
        },
      },
    ]);
  };

  const isOwnPost = appUserId === post.user.id;

  const showHeartBurst = () => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }),
      Animated.delay(400),
      Animated.timing(heartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleImageTap = () => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      if (pendingNavRef.current) { clearTimeout(pendingNavRef.current); pendingNavRef.current = null; }
      lastTapRef.current = 0;
      if (!isLiked) handleLike();
      showHeartBurst();
    } else {
      lastTapRef.current = now;
      pendingNavRef.current = setTimeout(() => {
        pendingNavRef.current = null;
        router.push(`/post/${post.id}`);
      }, DOUBLE_TAP_DELAY);
    }
  };

  const isQuote = post.type === "quote" || post.type === "story";

  return (
    <View style={styles.container}>
      {/* User Header */}
      <View style={styles.header}>
        <Pressable style={styles.userInfo} onPress={() => router.push(`/user/${post.user.id}`)}>
          <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size={40} />
          <View style={styles.userText}>
            <View style={styles.usernameRow}>
              <Text style={styles.username}>{post.user.username}</Text>
              {post.user.isVerified && (
                <View style={styles.verifiedDot}><Text style={styles.verifiedText}>✓</Text></View>
              )}
            </View>
            <Text style={styles.timestamp}>{getRelativeTime(post.createdAt)}</Text>
          </View>
        </Pressable>
        <View style={styles.headerRight}>
          <PostTypeBadge type={post.type} />
          <Pressable onPress={() => setShowMenu(true)} style={styles.menuButton} hitSlop={10}>
            <Text style={styles.menuIcon}>⋯</Text>
          </Pressable>
        </View>
      </View>

      {/* Three-dot menu modal */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setShowMenu(false)}>
          <View style={styles.menuSheet}>
            {isOwnPost ? (
              <Pressable style={styles.menuOption} onPress={handleDelete}>
                <Text style={[styles.menuOptionText, styles.destructiveText]}>Delete Post</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.menuOption} onPress={() => { setShowMenu(false); setShowReportReasons(true); }}>
                  <Text style={[styles.menuOptionText, styles.destructiveText]}>Report</Text>
                </Pressable>
                <Pressable style={styles.menuOption} onPress={handleBlock}>
                  <Text style={[styles.menuOptionText, styles.destructiveText]}>Block @{post.user.username}</Text>
                </Pressable>
              </>
            )}
            <Pressable style={[styles.menuOption, { borderBottomWidth: 0 }]} onPress={() => setShowMenu(false)}>
              <Text style={[styles.menuOptionText, { color: Colors.gray }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Report reasons modal */}
      <Modal visible={showReportReasons} transparent animationType="slide" onRequestClose={() => setShowReportReasons(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setShowReportReasons(false)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Report this post</Text>
            {REPORT_REASONS.map((reason) => (
              <Pressable key={reason} style={styles.menuOption} onPress={() => handleReport(reason)}>
                <Text style={styles.menuOptionText}>{reason}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.menuOption, { borderBottomWidth: 0 }]} onPress={() => setShowReportReasons(false)}>
              <Text style={[styles.menuOptionText, { color: Colors.gray }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toastVisible && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* Image (non-quote posts) */}
      {post.imageUrl && (
        <Pressable style={styles.imageContainer} onPress={handleImageTap}>
          <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
          <View style={styles.imageGradient} />
          <Animated.Text style={[styles.heartBurst, { transform: [{ scale: heartScale }], opacity: heartOpacity }]}>♥</Animated.Text>
        </Pressable>
      )}

      {/* Quote card for text-only quote/journal posts */}
      {isQuote && !post.imageUrl && (
        <Pressable onPress={() => router.push(`/post/${post.id}`)} style={styles.quoteCard}>
          <Text style={styles.quoteMarkTop}>"</Text>
          <Text style={styles.quoteText}>{post.caption}</Text>
          <View style={styles.quoteFooter}>
            <Text style={styles.quoteAuthor}>— @{post.user.username}</Text>
          </View>
        </Pressable>
      )}

      {/* Caption (non-quote posts) */}
      {!isQuote && (
        <Pressable style={styles.captionContainer} onPress={() => router.push(`/post/${post.id}`)}>
          <Text style={styles.caption}>
            <Text style={styles.captionUsername}>{post.user.username}</Text>
            {"  "}{post.caption}
          </Text>
        </Pressable>
      )}

      {/* Action Row */}
      <View style={styles.actionRow}>
        <View style={styles.actionLeft}>
          <Pressable onPress={handleLike} style={styles.actionButton} hitSlop={8}>
            <Text style={[styles.actionIcon, isLiked && styles.actionIconLiked]}>{isLiked ? "♥" : "♡"}</Text>
            <Text style={[styles.actionCount, isLiked && styles.actionCountLiked]}>{formatCount(likesCount)}</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => router.push(`/post/${post.id}`)} hitSlop={8}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={handleShare} hitSlop={8}>
            <Text style={styles.actionIcon}>↗</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.actionButton, isSaved && styles.actionButtonSaved]} onPress={handleSave} hitSlop={8}>
          <Text style={styles.actionIcon}>🔖</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.black, paddingVertical: 12 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  menuButton: { padding: 4 },
  menuIcon: { fontSize: 20, color: Colors.gray, letterSpacing: 1 },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  userText: { flex: 1 },
  usernameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  username: { fontSize: 15, fontWeight: "700", color: Colors.white },
  verifiedDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.gold, alignItems: "center", justifyContent: "center" },
  verifiedText: { fontSize: 9, fontWeight: "800", color: Colors.black },
  timestamp: { fontSize: 12, color: Colors.grayDark, marginTop: 1 },

  imageContainer: { position: "relative", marginBottom: 12 },
  postImage: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.65 },
  imageGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: 40, backgroundColor: "transparent" },
  heartBurst: {
    position: "absolute", alignSelf: "center", top: "35%",
    fontSize: 90, color: "#EF4444",
    textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },

  // Quote card
  quoteCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.dark800,
    borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: Colors.dark700,
    minHeight: 140, justifyContent: "center",
  },
  quoteMarkTop: {
    fontSize: 64, lineHeight: 56, color: Colors.gold,
    fontWeight: "800", opacity: 0.6, marginBottom: 4,
  },
  quoteText: {
    fontSize: 17, color: Colors.white, lineHeight: 26,
    fontStyle: "italic", fontWeight: "500",
    paddingHorizontal: 4,
  },
  quoteFooter: { marginTop: 16, alignItems: "flex-end" },
  quoteAuthor: { fontSize: 13, color: Colors.gold, fontWeight: "600" },

  captionContainer: { paddingHorizontal: 16, marginBottom: 10 },
  caption: { fontSize: 14, color: Colors.grayLight, lineHeight: 21 },
  captionUsername: { fontWeight: "700", color: Colors.white },

  actionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 4 },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 20 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 },
  actionIcon: { fontSize: 20, color: Colors.grayLight },
  actionIconLiked: { color: "#EF4444" },
  actionCount: { fontSize: 13, fontWeight: "600", color: Colors.gray },
  actionCountLiked: { color: "#EF4444" },
  actionButtonSaved: { backgroundColor: "rgba(250, 204, 21, 0.15)", borderRadius: 8, paddingHorizontal: 6 },

  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  menuSheet: { backgroundColor: Colors.dark800, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 36 },
  menuTitle: { fontSize: 13, fontWeight: "600", color: Colors.gray, textAlign: "center", paddingVertical: 12 },
  menuOption: { paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: Colors.dark700 },
  menuOptionText: { fontSize: 17, color: Colors.white, textAlign: "center" },
  destructiveText: { color: "#FF3B30" },

  toast: { position: "absolute", bottom: 80, alignSelf: "center", backgroundColor: "rgba(30,30,30,0.95)", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  toastText: { color: Colors.white, fontSize: 14, fontWeight: "600" },
});
