import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Briefcase,
  Gauge,
  LogOut,
  MessagesSquare,
  Scale,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { to: "/hr", label: "Overview", icon: Gauge, end: true },
  { to: "/hr/jobs", label: "Jobs", icon: Briefcase, end: false },
  { to: "/hr/candidates", label: "Candidates", icon: Users, end: false },
  { to: "/hr/interviews", label: "Interviews", icon: MessagesSquare, end: false },
  { to: "/hr/decisions", label: "Decisions", icon: Scale, end: false },
];

export default function HrLayout() {
  const { profile, organization, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (profile?.full_name || "HR")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Briefcase className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">INNOWISE</div>
            <div className="text-[11px] text-muted-foreground">HR Workspace</div>
          </div>
        </div>

        <Separator />

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-4">
          <div className="mb-3 flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{profile?.full_name}</div>
              <div className="truncate text-xs text-muted-foreground">{organization?.name}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <main className="app-shell flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
