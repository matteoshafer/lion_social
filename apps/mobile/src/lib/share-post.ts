import { Share, Platform } from "react-native";
import * as FileSystem from "expo-file-system";

const APP_URL = "https://testflight.apple.com/join/ArPDp7sU";

export async function sharePost(post: {
  id: string;
  imageUrl: string | null;
  caption: string;
  user: { username: string };
}) {
  const excerpt = post.caption.slice(0, 100) + (post.caption.length > 100 ? "…" : "");
  const text = `Check out this post on Gains!\n\n"${excerpt}"\n\n— @${post.user.username}\n\nDownload Gains: ${APP_URL}`;
  try {
    if (post.imageUrl && Platform.OS === "ios") {
      const ext = post.imageUrl.split("?")[0].split(".").pop() ?? "jpg";
      const localUri = `${FileSystem.cacheDirectory}share_${post.id}.${ext}`;
      await FileSystem.downloadAsync(post.imageUrl, localUri);
      await Share.share({ message: text, url: localUri });
    } else {
      await Share.share({ message: text });
    }
  } catch {}
}
