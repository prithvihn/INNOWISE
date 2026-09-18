import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { CandidateRow, OrganizationRow, Role, UserRow } from "@/lib/types";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserRow | null;
  organization: OrganizationRow | null;
  candidate: CandidateRow | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    fullName: string,
    email: string,
    password: string,
    role: Role
  ) => Promise<{ needsLogin: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
