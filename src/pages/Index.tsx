import { Link, Navigate } from "react-router-dom";
import { Briefcase, Loader2, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/useAuth";

const Index = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={profile?.role === "hr" ? "/hr" : "/candidate"} replace />;
  }

  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/30">
        <Briefcase className="h-8 w-8" />
      </div>
      <h1 className="gradient-text text-4xl font-bold tracking-tight sm:text-5xl">INNOWISE</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        AI-powered HR workforce management. Create jobs, let AI screen resumes, run adaptive
        interviews and make data-driven hiring decisions.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg">
          <Link to="/signup">Create an account</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>

      <div className="mt-12 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3">
        {[
          { icon: Sparkles, title: "AI screening", desc: "Reasoned resume-vs-job matching, not keyword counting." },
          { icon: Users, title: "Adaptive interviews", desc: "Role-specific questions that react to each answer." },
          { icon: Briefcase, title: "HR decisions", desc: "AI recommends. You decide — stored in the database." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-4">
            <f.icon className="mb-2 h-5 w-5 text-primary" />
            <div className="text-sm font-semibold">{f.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Index;
