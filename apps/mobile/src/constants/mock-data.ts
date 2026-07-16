/**
 * Gains - Mock Data
 * Sample data for development and UI prototyping
 */

export interface MockUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isVerified: boolean;
}

export interface MockPost {
  id: string;
  userId: string;
  user: MockUser;
  type: "workout" | "meal" | "quote" | "story";
  caption: string;
  imageUrl: string | null;
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  isSaved?: boolean;
  createdAt: string;
}

export interface MockNotification {
  id: string;
  type: "follow" | "like" | "comment";
  user: MockUser;
  postId?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ── Mock Users ──────────────────────────────────────────────────────────

export const MOCK_USERS: MockUser[] = [
  {
    id: "user-1",
    username: "marcus_fit",
    displayName: "Marcus Rivera",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    bio: "Fitness coach | Building strength inside and out | The grind never stops",
    followersCount: 12400,
    followingCount: 340,
    postsCount: 287,
    isVerified: true,
  },
  {
    id: "user-2",
    username: "sarah_wellness",
    displayName: "Sarah Chen",
    avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face",
    bio: "Yoga instructor | Plant-based nutrition | Mind over matter",
    followersCount: 8900,
    followingCount: 520,
    postsCount: 194,
    isVerified: true,
  },
  {
    id: "user-3",
    username: "james_iron",
    displayName: "James Okafor",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face",
    bio: "Powerlifter | Mental health advocate | Rise and conquer",
    followersCount: 5600,
    followingCount: 280,
    postsCount: 156,
    isVerified: false,
  },
  {
    id: "user-4",
    username: "elena_moves",
    displayName: "Elena Kowalski",
    avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    bio: "Runner | Meditation coach | Finding peace through movement",
    followersCount: 3200,
    followingCount: 190,
    postsCount: 98,
    isVerified: false,
  },
];

// ── Mock Posts ───────────────────────────────────────────────────────────

export const MOCK_POSTS: MockPost[] = [
  {
    id: "post-1",
    userId: "user-1",
    user: MOCK_USERS[0],
    type: "workout",
    caption:
      "5 AM club hitting different today. Deadlifted 405 for a triple. Remember: the pain you feel today is the strength you feel tomorrow. Keep pushing, kings and queens.",
    imageUrl:
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&h=400&fit=crop",
    likesCount: 847,
    commentsCount: 63,
    isLiked: false,
    createdAt: "2024-01-15T05:30:00Z",
  },
  {
    id: "post-2",
    userId: "user-2",
    user: MOCK_USERS[1],
    type: "meal",
    caption:
      "Fueling the body right. Post-workout smoothie bowl: acai, banana, spinach, hemp seeds, and almond butter. Nutrition is 80% of the game.",
    imageUrl:
      "https://images.unsplash.com/photo-1590301157890-4810ed352733?w=600&h=400&fit=crop",
    likesCount: 523,
    commentsCount: 41,
    isLiked: true,
    createdAt: "2024-01-15T08:15:00Z",
  },
  {
    id: "post-3",
    userId: "user-3",
    user: MOCK_USERS[2],
    type: "quote",
    caption:
      '"The only person you are destined to become is the person you decide to be." - Ralph Waldo Emerson\n\nThis hit hard during my morning meditation. Stop waiting for permission to become great.',
    imageUrl: null,
    likesCount: 1204,
    commentsCount: 89,
    isLiked: false,
    createdAt: "2024-01-14T20:00:00Z",
  },
  {
    id: "post-4",
    userId: "user-4",
    user: MOCK_USERS[3],
    type: "story",
    caption:
      "6 months ago I couldn't run a mile without stopping. Today I finished my first half marathon in 1:52. The journey isn't about speed - it's about showing up every single day. If I can do this, so can you.",
    imageUrl:
      "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=400&fit=crop",
    likesCount: 2341,
    commentsCount: 178,
    isLiked: true,
    createdAt: "2024-01-14T16:45:00Z",
  },
  {
    id: "post-5",
    userId: "user-1",
    user: MOCK_USERS[0],
    type: "workout",
    caption:
      "Push day complete. 4 sets of bench, incline DB press, cable flyes, and finished with 100 push-ups. Your body can handle almost anything - it's your mind you have to convince.",
    imageUrl:
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&h=400&fit=crop",
    likesCount: 612,
    commentsCount: 37,
    isLiked: false,
    createdAt: "2024-01-13T17:30:00Z",
  },
  {
    id: "post-6",
    userId: "user-2",
    user: MOCK_USERS[1],
    type: "meal",
    caption:
      "Meal prep Sunday done right. 5 days of balanced nutrition locked and loaded. Grilled chicken, sweet potato, broccoli, and quinoa. Discipline is choosing between what you want now and what you want most.",
    imageUrl:
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=400&fit=crop",
    likesCount: 389,
    commentsCount: 28,
    isLiked: false,
    createdAt: "2024-01-12T12:00:00Z",
  },
];

// ── Mock Notifications ──────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS: MockNotification[] = [
  {
    id: "notif-1",
    type: "follow",
    user: MOCK_USERS[2],
    message: "started following you",
    isRead: false,
    createdAt: "2024-01-15T10:30:00Z",
  },
  {
    id: "notif-2",
    type: "like",
    user: MOCK_USERS[0],
    postId: "post-4",
    message: "liked your post",
    isRead: false,
    createdAt: "2024-01-15T09:15:00Z",
  },
  {
    id: "notif-3",
    type: "comment",
    user: MOCK_USERS[1],
    postId: "post-3",
    message: 'commented: "This is so inspiring!"',
    isRead: false,
    createdAt: "2024-01-15T08:45:00Z",
  },
  {
    id: "notif-4",
    type: "like",
    user: MOCK_USERS[3],
    postId: "post-1",
    message: "liked your post",
    isRead: true,
    createdAt: "2024-01-14T22:00:00Z",
  },
  {
    id: "notif-5",
    type: "follow",
    user: MOCK_USERS[1],
    message: "started following you",
    isRead: true,
    createdAt: "2024-01-14T18:30:00Z",
  },
  {
    id: "notif-6",
    type: "comment",
    user: MOCK_USERS[0],
    postId: "post-2",
    message: 'commented: "Keep it up! Great progress."',
    isRead: true,
    createdAt: "2024-01-14T15:00:00Z",
  },
  {
    id: "notif-7",
    type: "like",
    user: MOCK_USERS[2],
    postId: "post-5",
    message: "liked your post",
    isRead: true,
    createdAt: "2024-01-13T20:00:00Z",
  },
];

// ── Trending Categories ─────────────────────────────────────────────────

export const CATEGORIES = [
  { id: "workout", label: "Workout", icon: "fitness-center" },
  { id: "meal", label: "Meal", icon: "restaurant" },
  { id: "quote", label: "Quote", icon: "format-quote" },
  { id: "story", label: "Journal", icon: "auto-stories" },
] as const;

// ── Helper ──────────────────────────────────────────────────────────────

export function getRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}
