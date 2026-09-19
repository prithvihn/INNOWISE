import { useRef, type MouseEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Briefcase, Loader2, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/context/useAuth";

/** Honey-amber glass briefcase with a burnt-amber band and clasp. */
function AmberBriefcase() {
  return (
    <div className="relative flex h-20 w-24 items-center justify-center sm:h-24 sm:w-28">
      <div className="absolute inset-0 rounded-2xl bg-amber-500/25 blur-2xl" aria-hidden />
      <svg viewBox="0 0 120 100" className="relative h-full w-full drop-shadow-[0_14px_22px_rgba(180,83,9,0.35)]">
        <defs>
          <linearGradient id="amberGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fcd34d" />
            <stop offset="0.5" stopColor="#f59e0b" />
            <stop offset="1" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="amberBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbbf24" stopOpacity="0.5" />
            <stop offset="1" stopColor="#d97706" stopOpacity="0.78" />
          </linearGradient>
          <linearGradient id="amberBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d97706" />
            <stop offset="1" stopColor="#92400e" />
          </linearGradient>
        </defs>

        {/* handle with dark-brown edge */}
        <path d="M46 32 V24 a14 14 0 0 1 28 0 V32" stroke="#451a03" strokeWidth="8" fill="none" strokeLinecap="round" />
        <path d="M46 32 V24 a14 14 0 0 1 28 0 V32" stroke="url(#amberGlass)" strokeWidth="4.5" fill="none" strokeLinecap="round" />

        {/* honey-amber glass body */}
        <rect x="13" y="32" width="94" height="56" rx="11" fill="url(#amberBody)" stroke="#451a03" strokeWidth="3" />
        <rect x="16" y="35" width="88" height="50" rx="9" fill="url(#amberGlass)" opacity="0.16" />

        {/* burnt-amber band */}
        <rect x="47" y="32" width="26" height="56" fill="url(#amberBand)" />
        <rect x="50" y="32" width="20" height="56" fill="#78350f" opacity="0.5" />

        {/* clasp */}
        <rect x="53" y="27" width="14" height="11" rx="3.5" fill="url(#amberGlass)" stroke="#451a03" strokeWidth="2.5" />
        <circle cx="60" cy="32" r="2.4" fill="#451a03" />

        {/* dark brown edge details + glass shine */}
        <rect x="16" y="35" width="88" height="4" rx="2" fill="#451a03" opacity="0.5" />
        <path d="M22 42 h16 a7 7 0 0 1 0 14 h-16 z" fill="#ffffff" opacity="0.4" />
        <path d="M22 68 h26" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.22" />
      </svg>
    </div>
  );
}

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI screening",
    desc: "Reasoned resume-vs-job matching, not keyword counting.",
  },
  {
    icon: Users,
    title: "Adaptive interviews",
    desc: "Role-specific questions that react to each answer.",
  },
  {
    icon: Briefcase,
    title: "HR decisions",
    desc: "AI recommends. You decide — stored in the database.",
  },
];

const Index = () => {
  const { user, profile, loading } = useAuth();
  const shellRef = useRef<HTMLDivElement | null>(null);

  function trackCursor(e: MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE]">
        <Loader2 className="h-6 w-6 animate-spin text-[#B45309]" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={profile?.role === "hr" ? "/hr" : "/candidate"} replace />;
  }

  return (
    <div
      ref={shellRef}
      onMouseMove={trackCursor}
      className="landing-root relative flex min-h-screen flex-col overflow-hidden bg-[#F5F3EE]"
    >
      {/* background atmosphere */}
      <div className="landing-grid absolute inset-0" aria-hidden />
      <div className="landing-orb orb-peach h-72 w-72 -left-24 top-10" aria-hidden />
      <div className="landing-orb orb-butter h-80 w-80 -right-28 top-1/3" aria-hidden />
      <div className="landing-orb orb-peach h-56 w-56 bottom-0 left-1/4" aria-hidden />
      <div className="cursor-light absolute inset-0" aria-hidden />

      {/* hero */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-8">
          <AmberBriefcase />
        </div>

        <h1 className="amber-gradient-text text-[2.6rem] font-bold leading-tight tracking-tight sm:text-6xl">
          INNOWISE
        </h1>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#57534E]">
          AI-powered HR workforce management. Create jobs, let AI screen resumes,
          run adaptive interviews and make data-driven hiring decisions.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link to="/signup" className="btn-amber">
            <Sparkles className="h-4 w-4" />
            Create an account
          </Link>
          <Link to="/login" className="btn-outline-warm">
            Sign in
          </Link>
        </div>

        {/* feature cards */}
        <div className="mt-14 grid w-full max-w-3xl grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-card p-5">
              <f.icon className="mb-3 h-5 w-5 text-[#B45309]" strokeWidth={2} />
              <div className="text-[15px] font-semibold text-[#1C1917]">{f.title}</div>
              <div className="mt-1.5 text-[13px] leading-relaxed text-[#57534E]">{f.desc}</div>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[11px] uppercase tracking-[0.22em] text-[#57534E]/70">
          AI only recommends · you make the final call
        </p>
      </div>
    </div>
  );
};

export default Index;
