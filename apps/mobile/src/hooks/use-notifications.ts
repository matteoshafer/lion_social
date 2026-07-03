import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export interface RealNotification {
  id: string;
  type: "follow" | "like" | "comment" | "save";
  actor: { id: string; username: string; avatarUrl: string | null };
  postId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<RealNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [appUserId, setAppUserId] = useState<string | null>(null);

  const buildNotifications = (
    rows: { id: string; type: string; referenceId: string; read: boolean; createdAt: string }[],
    actors: Record<string, { id: string; username: string; avatarUrl: string | null }>
  ): RealNotification[] =>
    rows.map((n) => {
      const [actorId, postId] = n.referenceId.split(":");
      const actor = actors[actorId] ?? { id: actorId, username: "unknown", avatarUrl: null };
      const message =
        n.type === "like"
          ? "liked your post"
          : n.type === "comment"
          ? "commented on your post"
          : n.type === "save"
          ? "favorited your post"
          : "started following you";
      return {
        id: n.id,
        type: n.type as RealNotification["type"],
        actor,
        postId: postId ?? null,
        message,
        isRead: n.read,
        createdAt: n.createdAt,
      };
    });

  const fetchNotifications = useCallback(async (userId: string) => {
    const { data: rows } = await supabase
      .from("Notification")
      .select("id, type, referenceId, read, createdAt")
      .eq("userId", userId)
      .order("createdAt", { ascending: false })
      .limit(50);

    if (!rows?.length) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const actorIds = Array.from(new Set(rows.map((n) => n.referenceId.split(":")[0])));
    const { data: actorRows } = await supabase
      .from("User")
      .select("id, username, avatarUrl")
      .in("id", actorIds);

    const actorMap = Object.fromEntries((actorRows ?? []).map((a) => [a.id, a]));
    const enriched = buildNotifications(rows, actorMap);

    setNotifications(enriched);
    setUnreadCount(enriched.filter((n) => !n.isRead).length);
    setLoading(false);
  }, []);

  // Resolve auth session → app User.id on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setLoading(false);
        return;
      }

      const { data: appUser } = await supabase
        .from("User")
        .select("id")
        .eq("supabaseId", session.user.id)
        .single();

      if (!appUser) {
        setLoading(false);
        return;
      }

      setAppUserId(appUser.id);
      await fetchNotifications(appUser.id);
    });
  }, [fetchNotifications]);

  // Realtime: re-fetch on any change (INSERT/UPDATE/DELETE) so the list and badge stay in sync
  useEffect(() => {
    if (!appUserId) return;

    const channel = supabase
      .channel(`mobile-notifications-${appUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Notification",
          filter: `userId=eq.${appUserId}`,
        },
        () => {
          fetchNotifications(appUserId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appUserId, fetchNotifications]);

  // Polling fallback: re-fetch every 30s in case realtime isn't delivering events
  useEffect(() => {
    if (!appUserId) return;

    const interval = setInterval(() => {
      fetchNotifications(appUserId);
    }, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [appUserId, fetchNotifications]);

  const markAllRead = useCallback(async () => {
    if (!appUserId) return;
    await supabase
      .from("Notification")
      .update({ read: true })
      .eq("userId", appUserId)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, [appUserId]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("Notification").update({ read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const refetch = useCallback(async () => {
    if (appUserId) await fetchNotifications(appUserId);
  }, [appUserId, fetchNotifications]);

  return { notifications, unreadCount, loading, markAllRead, markRead, refetch };
}
