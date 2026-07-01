import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
  Share,
  Platform,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { supabase } from "../lib/supabase";
import { type MockPost, getRelativeTime, formatCount } from "../constants/mock-data";
import Avatar from "./Avatar";
import PostTypeBadge from "./PostTypeBadge";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface PostCardProps {
  post: MockPost;
  currentUserId?: string | null; // Pass from parent to avoid per-card auth fetch
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isSaved, setIsSaved] = useState(false);
  const [appUserId, setAppUserId] = useState<string | null>(currentUserId ?? null);
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<number>(0);
  const pendingNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent when post data changes (e.g. after navigating back to feed)
  useEffect(() => {
    setIsLiked(post.isLiked);
    setLikesCount(post.likesCount);
  }, [post.isLiked, post.likesCount]);

  useEffect(() => {
    const uid = currentUserId ?? null;
    if (uid) {
      // Parent provided userId — just check save state (like state comes from feed)
      setAppUserId(uid);
      supabase.from("Save").select("id").eq("postId", post.id).eq("userId", uid).maybeSingle()
        .then(({ data }) => setIsSaved(!!data));
    } else {
      // Fallback: fetch from session
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session) return;
        const { data: appUser } = await supabase.from("User").select("id").eq("supabaseId", session.user.id).single();
        if (!appUser) return;
        setAppUserId((appUser as any).id);
        const [{ data: like }, { data: save }] = await Promise.all([
          supabase.from("Like").select("id").eq("postId", post.id).eq("userId", (appUser as any).id).maybeSingle(),
          supabase.from("Save").select("id").eq("postId", post.id).eq("userId", (appUser as any).id).maybeSingle(),
        ]);
        setIsLiked(!!like);
        setIsSaved(!!save);
      });
    }
  }, [post.id, currentUserId]);

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

  const handleShare = async () => {
    const appUrl = "https://testflight.apple.com/join/ArPDp7sU";
    const excerpt = post.caption.slice(0, 100) + (post.caption.length > 100 ? "…" : "");
    const text = `Check out this post on Gains!\n\n"${excerpt}"\n\n— @${post.user.username}\n\nDownload Gains 👇\n${appUrl}`;
    try {
      // On iOS: download the image and share it as a file so it appears in the share sheet
      if (post.imageUrl && Platform.OS === "ios") {
        const ext = post.imageUrl.split("?")[0].split(".").pop() ?? "jpg";
        const localUri = `${FileSystem.cacheDirectory}share_${post.id}.${ext}`;
        await FileSystem.downloadAsync(post.imageUrl, localUri);
        await Share.share({ message: text, url: localUri });
      } else {
        await Share.share({ message: text, url: appUrl });
      }
    } catch {}
  };

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
        <PostTypeBadge type={post.type} />
      </View>

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
          <Pressable onPress={handleLike} style={styles.actionButton}>
            <Text style={[styles.actionIcon, isLiked && styles.actionIconLiked]}>{isLiked ? "♥" : "♡"}</Text>
            <Text style={[styles.actionCount, isLiked && styles.actionCountLiked]}>{formatCount(likesCount)}</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => router.push(`/post/${post.id}`)}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionCount}>{formatCount(post.commentsCount)}</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionIcon}>↗</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.actionButton, isSaved && styles.actionButtonSaved]} onPress={handleSave}>
          <Text style={styles.actionIcon}>🔖</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.black, paddingVertical: 12 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
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
});
