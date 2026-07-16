import { supabase } from "./supabase";

/**
 * Session-lifetime cache of the current app user (User table row id + username).
 *
 * Nearly every screen needs to resolve `auth session -> User.id`, which
 * previously cost a getSession() + a User table query per screen per mount.
 * This module resolves it once and caches it until the auth state changes.
 */

type CachedAppUser = { id: string; username: string | null } | null;

let cachedAppUser: CachedAppUser | undefined = undefined;
let inflight: Promise<CachedAppUser> | null = null;

// Invalidate on sign-in/sign-out/token-refresh-with-new-user
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
    cachedAppUser = undefined;
    inflight = null;
  }
});

async function resolveAppUser(): Promise<CachedAppUser> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from("User")
    .select("id, username")
    .eq("supabaseId", session.user.id)
    .maybeSingle();
  if (!data) return null;
  return { id: (data as any).id, username: (data as any).username ?? null };
}

/**
 * Returns the cached app user record ({ id, username }) or null when signed out.
 * Concurrent callers share a single in-flight request.
 */
export async function getAppUser(): Promise<CachedAppUser> {
  if (cachedAppUser !== undefined) return cachedAppUser;
  if (!inflight) {
    inflight = resolveAppUser()
      .then((result) => {
        cachedAppUser = result;
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Returns the app User.id for the current session, or null when signed out. */
export async function getAppUserId(): Promise<string | null> {
  const user = await getAppUser();
  return user?.id ?? null;
}

/** Manually clear the cache (e.g. after creating the User row post-signup). */
export function invalidateAppUserCache(): void {
  cachedAppUser = undefined;
  inflight = null;
}
