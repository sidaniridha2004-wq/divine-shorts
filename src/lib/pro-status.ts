import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Module-level cache so non-React code (canvas draw loop) can read it synchronously.
let _cached: { userId: string | null; isPro: boolean; isAdmin: boolean } = {
  userId: null,
  isPro: false,
  isAdmin: false,
};

export function isProNow(): boolean {
  return _cached.isPro;
}
export function isAdminNow(): boolean {
  return _cached.isAdmin;
}

async function fetchStatus(userId: string | null) {
  if (!userId) {
    _cached = { userId: null, isPro: false, isAdmin: false };
    return _cached;
  }
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("is_pro").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  _cached = {
    userId,
    isPro: !!profile?.is_pro,
    isAdmin: !!roles?.some((r: any) => r.role === "admin"),
  };
  return _cached;
}

export type SessionState = {
  userId: string | null;
  email: string | null;
  isPro: boolean;
  isAdmin: boolean;
  loading: boolean;
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    userId: null,
    email: null,
    isPro: _cached.isPro,
    isAdmin: _cached.isAdmin,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    const sync = async (userId: string | null, email: string | null) => {
      const s = await fetchStatus(userId);
      if (!alive) return;
      setState({ userId, email, isPro: s.isPro, isAdmin: s.isAdmin, loading: false });
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
