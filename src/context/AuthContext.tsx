import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  bootstrapProfile,
  fetchMyCandidate,
  fetchOrganization,
  fetchUserProfile,
} from "@/lib/api";
import type { CandidateRow, OrganizationRow, Role, UserRow } from "@/lib/types";
import { AuthContext } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [organization, setOrganization] = useState<OrganizationRow | null>(null);
  const [candidate, setCandidate] = useState<CandidateRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (): Promise<void> => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    try {
      const p = await fetchUserProfile(userId);
      setProfile(p);
      if (p?.role === "hr" && p.organization_id) {
        setOrganization(await fetchOrganization(p.organization_id));
        setCandidate(null);
      } else if (p?.role === "candidate") {
        setCandidate(await fetchMyCandidate(userId));
        setOrganization(null);
      }
    } catch {
      // Profile may not exist yet (just signed up) - ignore
    }
  }, []);

  useEffect(() => {
    // Register the listener BEFORE checking for an existing session
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        // Defer supabase calls made inside the callback
        setTimeout(() => {
          refreshProfile();
        }, 0);
      } else {
        setProfile(null);
        setOrganization(null);
        setCandidate(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        setTimeout(() => {
          refreshProfile();
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refreshProfile();
  }, [refreshProfile]);

  const signUp = useCallback(
    async (fullName: string, email: string, password: string, role: Role) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      if (!data.session) return { needsLogin: true };
      await bootstrapProfile(data.session.user.id, role, fullName, email);
      await refreshProfile();
      return { needsLogin: false };
    },
    [refreshProfile]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setOrganization(null);
    setCandidate(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        organization,
        candidate,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
