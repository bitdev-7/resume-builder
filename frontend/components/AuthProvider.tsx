"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import type { AppRole } from "@/lib/supabase/database.types";
import type { User } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  // The id currently reflected in state. Guards against re-setting `user` when Supabase
  // fires SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED on tab refocus — a new user object
  // reference would re-run every effect that depends on `user` (reloading pages).
  const appliedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const finishLoading = () => {
      if (active) setLoading(false);
    };

    const applySession = async (nextUser: User | null) => {
      if (!active) return;

      const nextId = nextUser?.id ?? null;
      // Only touch state when the signed-in identity actually changes. Focus/refresh
      // events for the same user are ignored, so nothing downstream reloads.
      if (nextId === appliedUserIdRef.current) {
        finishLoading();
        return;
      }

      appliedUserIdRef.current = nextId;
      setUser(nextUser);

      if (nextUser) {
        try {
          const profile = await ensureProfile(nextUser.id);
          if (active) {
            setRole(profile?.role === "admin" ? "admin" : profile ? "user" : null);
          }
        } catch (error) {
          console.warn("Could not ensure profile (Supabase may be unreachable):", error);
          if (active) setRole(null);
        }
      } else {
        setRole(null);
      }
      finishLoading();
    };

    // onAuthStateChange also delivers the INITIAL_SESSION event, so no separate getSession call.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user ?? null);
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
    appliedUserIdRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
