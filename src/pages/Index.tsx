import { useEffect, useRef } from "react";
import { Link, Navigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { ArrowRight, Briefcase, Loader2, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/context/useAuth";

gsap.registerPlugin(ScrollTrigger);

const reduceMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isCoarse =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768);

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

/* ---------------------------------------------------------------------------
 * Low-poly honey-amber glass briefcase
 * ------------------------------------------------------------------------- */
function Briefcase3D({ scroll }: { scroll: { current: number } }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const s = scroll.current;

    if (reduceMotion) {
      g.rotation.set(0, s * Math.PI * 2, 0);
      g.position.set(s * 0.7, -s * 1.1, 0);
      g.scale.setScalar(1 - s * 0.2);
      return;
    }

    // Idle: slow continuous Y spin (~0.15 rad/s) + gentle bob
    const idleY = t * 0.15;

    // Cursor response: tilt toward pointer within ±0.35 rad, lerped softly
    const targetY = idleY + (isCoarse ? 0 : state.pointer.x * 0.35);
    const targetX = isCoarse ? 0 : state.pointer.y * 0.35;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, 0.06);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, 0.06);

    // Scroll response: extra full rotation, drift down/center, scale down ~20%
    g.position.y = Math.sin(t * 0.8) * 0.08 - s * 1.1;
    g.position.x = THREE.MathUtils.lerp(g.position.x, s * 0.7, 0.08);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, 1 - s * 0.2, 0.1));
    void delta;
  });

  return (
    <group ref={group}>
      {/* translucent pale-yellow glass body */}
      <mesh castShadow>
        <boxGeometry args={[2.4, 1.5, 1.1]} />
        <meshPhysicalMaterial
          color="#FFEFC2"
          transmission={0.9}
          opacity={0.35}
          transparent
          roughness={0.12}
          thickness={0.5}
          metalness={0}
        />
        <Edges color="#E8A33D" />
      </mesh>

      {/* ribbed arch handle */}
      <mesh position={[0, 0.82, 0]}>
        <torusGeometry args={[0.42, 0.06, 12, 32, Math.PI]} />
        <meshStandardMaterial color="#C97B2C" metalness={0.3} roughness={0.35} />
      </mesh>
      {[-0.52, 0, 0.52].map((x) => (
        <mesh key={x} position={[x, 0.94, 0]}>
          <boxGeometry args={[0.07, 0.16, 0.12]} />
          <meshStandardMaterial color="#E8A33D" metalness={0.2} roughness={0.4} />
        </mesh>
      ))}

      {/* orange latch bar across the middle front */}
      <mesh position={[0, 0.05, 0.62]}>
        <boxGeometry args={[0.7, 0.18, 0.14]} />
        <meshStandardMaterial color="#C97B2C" metalness={0.3} roughness={0.3} />
      </mesh>

      {/* amber corner studs */}
      {(
        [
          [-0.9, -0.55],
          [0.9, -0.55],
          [-0.9, 0.55],
          [0.9, 0.55],
        ] as [number, number][]
      ).map(([x, z], i) => (
        <mesh key={i} position={[x, 0, z * 0.62]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#E8A33D" metalness={0.4} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------------------
 * Landing
 * ------------------------------------------------------------------------- */
const Index = () => {
  const { user, profile, loading } = useAuth();

  const pageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const s2Ref = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLElement>(null);
  const scrollRef = useRef(0);

  // Lenis smooth scroll
  useEffect(() => {
    if (reduceMotion) return;
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  // GSAP scroll animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Briefcase scroll progress (drives the 3D tumble)
      if (heroRef.current) {
        ScrollTrigger.create({
          trigger: heroRef.current,
          start: "top top",
          end: "bottom top",
          onUpdate: (st) => {
            scrollRef.current = st.progress;
          },
        });
      }

      // Navbar: shrink + deepen blur after 80px
      ScrollTrigger.create({
        start: 80,
        onUpdate: (st) => {
          if (!navRef.current) return;
          if (st.scroll() > 80) navRef.current.classList.add("shrunk");
          else navRef.current.classList.remove("shrunk");
        },
      });

      // Orbs drift slightly with scroll
      if (!reduceMotion) {
        gsap.to(".orb-a", {
          xPercent: 10,
          yPercent: 12,
          ease: "none",
          scrollTrigger: {
            trigger: pageRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 1,
          },
        });
        gsap.to(".orb-b", {
          xPercent: -10,
          yPercent: -12,
          ease: "none",
          scrollTrigger: {
            trigger: pageRef.current,
            start: "top top",
            end: "bottom bottom",
            scrub: 1,
          },
        });
      }

      // Hero entrance
      if (!reduceMotion) {
        gsap.fromTo(
          ".hero-letter",
          { y: 90, opacity: 0, filter: "blur(10px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 0.8,
            stagger: 0.04,
            ease: "power3.out",
            delay: 0.1,
          }
        );
        gsap.fromTo(
          ".hero-fade",
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: "power3.out", delay: 0.55 }
        );
      }

      // Section 2: heading lines wipe up, body fades after
      if (!reduceMotion && s2Ref.current) {
        gsap.fromTo(
          ".s2-line",
          { clipPath: "inset(0 0 100% 0)", y: 14 },
          {
            clipPath: "inset(0 0 0% 0)",
            y: 0,
            duration: 0.8,
            stagger: 0.14,
            ease: "power3.out",
            scrollTrigger: { trigger: s2Ref.current, start: "top 70%", once: true },
          }
        );
        gsap.fromTo(
          ".s2-body",
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            delay: 0.15,
            ease: "power3.out",
            scrollTrigger: { trigger: s2Ref.current, start: "top 70%", once: true },
          }
        );
      }

      // Section 3: feature cards stagger in
      if (!reduceMotion && cardsRef.current) {
        gsap.fromTo(
          ".feat-card",
          { opacity: 0, y: 40, scale: 0.96 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.7,
            stagger: 0.12,
            ease: "power3.out",
            scrollTrigger: { trigger: cardsRef.current, start: "top 78%", once: true },
          }
        );
      }

      // Section 4: CTA band scales up
      if (!reduceMotion && ctaRef.current) {
        gsap.fromTo(
          ".cta-band",
          { opacity: 0, scale: 0.95 },
          {
            opacity: 1,
            scale: 1,
            duration: 0.7,
            ease: "power3.out",
            scrollTrigger: { trigger: ctaRef.current, start: "top 80%", once: true },
          }
        );
      }
    }, pageRef);

    return () => ctx.revert();
  }, []);

  if (loading) {
    return (
      <div className="land-mono flex min-h-screen items-center justify-center bg-[#F5EDE3]">
        <Loader2 className="h-6 w-6 animate-spin text-[#7A4A22]" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={profile?.role === "hr" ? "/hr" : "/candidate"} replace />;
  }

  return (
    <div
      ref={pageRef}
      className="land-mono land-wrap relative min-h-screen overflow-x-clip text-[#7A4A22]"
    >
      {/* fixed atmosphere: grid + drifting amber blobs */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="land-grid absolute inset-0" />
        <div className="land-orb orb-a left-[-8rem] top-[-7rem] h-96 w-96" />
        <div className="land-orb orb-b right-[-7rem] top-1/3 h-[26rem] w-[26rem]" />
      </div>

      <div className="relative z-10">
        {/* NAVBAR */}
        <header className="sticky top-6 z-50 flex justify-center px-4">
          <nav
            ref={navRef}
            className="nav-pill flex w-full max-w-[1200px] items-center justify-between rounded-full px-6 py-3"
          >
            <Link to="/" className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#E8A33D]" />
              <span className="text-sm font-bold tracking-wide text-[#7A4A22]">INNOWISE</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost-pill">
                Sign in
              </Link>
              <Link to="/signup" className="btn-solid-pill">
                Create an account
              </Link>
            </div>
          </nav>
        </header>

        {/* HERO — two-column split */}
        <section
          ref={heroRef}
          className="relative mx-auto grid min-h-[100svh] w-full max-w-[1200px] grid-cols-1 items-center gap-6 px-6 pb-16 pt-28 lg:grid-cols-2"
        >
          <div className="relative z-0">
            <h1 className="whitespace-nowrap text-[#7A4A22] text-[clamp(3.5rem,9vw,8rem)] font-bold leading-none tracking-tight">
              {"INNOWISE".split("").map((ch, i) => (
                <span key={i} className="hero-letter inline-block will-change-transform">
                  {ch}
                </span>
              ))}
            </h1>
            <p className="hero-fade mt-7 max-w-xl text-[15px] leading-relaxed text-[#7A4A22]/80">
              AI-powered HR workforce management:{" "}
              <span className="font-bold text-[#7A4A22]">create jobs</span>, screen resumes,
              interview adaptively, and hire with data.
            </p>
            <div className="hero-fade mt-8 flex flex-wrap items-center gap-4">
              <Link to="/signup" className="btn-solid-pill px-7 py-3 text-base">
                Create an account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className="btn-ghost-pill px-7 py-3 text-base">
                Sign in
              </Link>
            </div>
          </div>

          {/* 3D briefcase — transparent canvas overlapping the wordmark */}
          <div className="relative z-10 h-[52vh] lg:-ml-24 lg:h-[82vh]">
            <Canvas
              dpr={[1, 2]}
              camera={{ position: [0, 0.4, 6.4], fov: 42 }}
              gl={{ alpha: true, antialias: true }}
              style={{ background: "transparent" }}
            >
              <ambientLight intensity={0.55} />
              <directionalLight position={[5, 7, 5]} intensity={1.5} color="#FFE9C4" />
              <directionalLight position={[-5, -2, -4]} intensity={0.6} color="#FFB98A" />
              <pointLight position={[-3, 1, 3]} intensity={0.5} color="#E8A33D" />
              <Briefcase3D scroll={scrollRef} />
            </Canvas>
          </div>
        </section>

        {/* SECTION 2 — statement */}
        <section ref={s2Ref} className="mx-auto max-w-[1200px] px-6 py-28">
          <h2 className="text-[#7A4A22] text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.05] tracking-tight">
            <span className="s2-line block">From job post to hiring</span>
            <span className="s2-line block">decision, in one place.</span>
          </h2>
          <p className="s2-body mt-6 max-w-lg text-[15px] leading-relaxed text-[#7A4A22]/75">
            Create a job and INNOWISE&rsquo;s AI handles the heavy lifting at every stage.
          </p>
        </section>

        {/* SECTION 3 — feature cards */}
        <section ref={cardsRef} className="mx-auto max-w-[1200px] px-6 pb-28">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="feat-card glass-card p-8">
                <div className="card-icon mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8A33D]/20 text-[#C97B2C]">
                  <f.icon className="h-6 w-6" />
                </div>
                <div className="text-[17px] font-bold text-[#7A4A22]">{f.title}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#7A4A22]/70">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4 — CTA band */}
        <section ref={ctaRef} className="mx-auto max-w-[1200px] px-6 pb-28">
          <div className="cta-band glass-card flex flex-col items-center gap-7 px-8 py-16 text-center">
            <h3 className="text-[#7A4A22] text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-tight">
              Start hiring with INNOWISE.
            </h3>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/signup" className="btn-solid-pill px-7 py-3 text-base">
                Create an account
              </Link>
              <Link to="/login" className="btn-ghost-pill px-7 py-3 text-base">
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="pb-10 pt-4 text-center text-xs text-[#7A4A22]/60">
          &copy; 2026 INNOWISE. All rights reserved.
        </footer>
      </div>
    </div>
  );
};

export default Index;
