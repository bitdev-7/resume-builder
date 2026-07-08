"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const ensuredUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const finishLoading = () => {
      if (active) setLoading(false);
    };

    const applySession = async (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);

      if (!nextUser || ensuredUserIdRef.current === nextUser.id) {
        return;
      }

      ensuredUserIdRef.current = nextUser.id;
      try {
        await ensureProfile(nextUser.id);
      } catch (error) {
        console.warn("Could not ensure profile (Supabase may be unreachable):", error);
      }
    };

    // onAuthStateChange handles INITIAL_SESSION — avoid duplicate getSession + refresh calls
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refresh on tab focus should not reset UI or re-run profile loads.
      if (
        event === "TOKEN_REFRESHED" &&
        session?.user?.id &&
        ensuredUserIdRef.current === session.user.id
      ) {
        finishLoading();
        return;
      }

      void applySession(session?.user ?? null);
      finishLoading();
    });

    // Fallback: if auth init hangs (network timeout), still render the app
    const loadingTimeout = window.setTimeout(finishLoading, 4000);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.clearTimeout(loadingTimeout);
    };
  }, []);

  const signOut = async () => {
    ensuredUserIdRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
