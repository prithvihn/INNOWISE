import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import type { Role } from "@/lib/types";

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/" replace />;
  if (profile.role !== role) {
    return <Navigate to={profile.role === "hr" ? "/hr" : "/candidate"} replace />;
  }
  return <>{children}</>;
}
