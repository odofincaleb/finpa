import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { fetchMe } from "../lib/api";
import type { Profile } from "../types";

const DEV_SESSION_KEY = "finpa.dev.session";

type AuthContextValue = {
  loading: boolean;
  token: string | null;
  profile: Profile | null;
  subscriptionActive: boolean;
  isSuperAdmin: boolean;
  isDevAuth: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfileLocal: (profile: Profile, subscriptionActive: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function makeDevProfile(userId: string, email: string): Profile {
  return {
    id: userId,
    email,
    preferred_currency: "NGN",
    subscription_period: null,
    subscription_expires_at: null,
    activated_at: null,
    created_at: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const hydrateFromToken = useCallback(async (accessToken: string) => {
    try {
      const me = await fetchMe(accessToken);
      setToken(accessToken);
      setProfile(me.profile);
      setSubscriptionActive(me.subscriptionActive);
      setIsSuperAdmin(Boolean(me.isSuperAdmin));
    } catch {
      setToken(accessToken);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        if (isSupabaseConfigured && supabase) {
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token && mounted) {
            await hydrateFromToken(data.session.access_token);
          }
          supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) return;
            if (session?.access_token) {
              await hydrateFromToken(session.access_token);
            } else {
              setToken(null);
              setProfile(null);
              setSubscriptionActive(false);
              setIsSuperAdmin(false);
            }
          });
        } else {
          const raw = await AsyncStorage.getItem(DEV_SESSION_KEY);
          if (raw && mounted) {
            const parsed = JSON.parse(raw) as { token: string; profile: Profile };
            setToken(parsed.token);
            try {
              const me = await fetchMe(parsed.token);
              setProfile(me.profile);
              setSubscriptionActive(me.subscriptionActive);
              setIsSuperAdmin(Boolean(me.isSuperAdmin));
            } catch {
              setProfile(parsed.profile);
            }
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, [hydrateFromToken]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session?.access_token) {
        await hydrateFromToken(data.session.access_token);
      }
      return;
    }

    const userId = `dev-${email.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const accessToken = `dev:${userId}:${email}`;
    let nextProfile = makeDevProfile(userId, email);
    let active = false;
    let admin = false;
    try {
      const me = await fetchMe(accessToken);
      nextProfile = me.profile;
      active = me.subscriptionActive;
      admin = Boolean(me.isSuperAdmin);
    } catch {
      // backend may be offline; still allow local session
    }
    await AsyncStorage.setItem(
      DEV_SESSION_KEY,
      JSON.stringify({ token: accessToken, profile: nextProfile }),
    );
    setToken(accessToken);
    setProfile(nextProfile);
    setSubscriptionActive(active);
    setIsSuperAdmin(admin);
  }, [hydrateFromToken]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session?.access_token) {
          await hydrateFromToken(data.session.access_token);
        } else {
          await signIn(email, password).catch(() => {
            throw new Error(
              "Account created. Confirm your email if required, then sign in.",
            );
          });
        }
        return;
      }
      await signIn(email, password);
    },
    [hydrateFromToken, signIn],
  );

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    await AsyncStorage.removeItem(DEV_SESSION_KEY);
    setToken(null);
    setProfile(null);
    setSubscriptionActive(false);
    setIsSuperAdmin(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    const me = await fetchMe(token);
    setProfile(me.profile);
    setSubscriptionActive(me.subscriptionActive);
    setIsSuperAdmin(Boolean(me.isSuperAdmin));
  }, [token]);

  const setProfileLocal = useCallback((next: Profile, active: boolean) => {
    setProfile(next);
    setSubscriptionActive(active);
  }, []);

  const value = useMemo(
    () => ({
      loading,
      token,
      profile,
      subscriptionActive,
      isSuperAdmin,
      isDevAuth: !isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      setProfileLocal,
    }),
    [
      loading,
      token,
      profile,
      subscriptionActive,
      isSuperAdmin,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      setProfileLocal,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
