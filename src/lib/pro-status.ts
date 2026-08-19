import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// There is no paid tier and no payment processor in this app. Every editor
// feature is free: 1080p export, full watermark control, all themes, all
// reciters, all translations.
//
// `isPro` is kept in the session shape (hardcoded true) so that existing
// components keep compiling without a sweeping refactor.
//
// `isAdmin` is real role-based access control, backed by the `user_roles`
// table. Treat the value here as a UI hint only — it is trivially spoofable in
// the browser, so every privileged action MUST also be enforced server-side by
// RLS policies and/or SECURITY DEFINER functions.
// ─────────────────────────────────────────────────────────────────────────────

let _cached: { userId: string | null; isAdmin: boolean } = {
  userId: null,
  isAdmin: false,
};

/**
 * All features are free. Kept as a synchronous getter because the canvas draw
 * loop reads it once per frame and cannot await.
 */
export function isProNow(): boolean {
  return true;
}

export function isAdminNow(): boolean {
  return _cached.isAdmin;
}

async function fetchStatus(userId: string | null) {
  if (!userId) {
    _cached = { userId: null, isAdmin: false };
    return _cached;
  }
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  _cached = {
    userId,
    isAdmin: !!roles?.some((r: { role?: string | null }) => r.role === "admin"),
  };
  return _cached;
}

export type SessionState = {
  userId: string | null;
  email: string | null;
  /** Always true — every feature is free. */
  isPro: boolean;
  isAdmin: boolean;
  loading: boolean;
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    userId: null,
    email: null,
    isPro: true,
    isAdmin: _cached.isAdmin,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    const sync = async (userId: string | null, email: string | null) => {
      const s = await fetchStatus(userId);
      if (!alive) return;
      setState({
        userId,
        email,
        isPro: true,
        isAdmin: s.isAdmin,
        loading: false,
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      sync(u?.id ?? null, u?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      sync(u?.id ?? null, u?.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
