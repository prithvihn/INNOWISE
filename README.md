# INNOWISE — AI-Powered HR Workforce Management

<p align="center">
  <a href="https://d24d7797e19e4ea593e540ec0666b2c5.prod.enterapp.pro" target="_blank">
    <img src="https://img.shields.io/badge/🚀%20Live%20Demo-Visit%20Project-2ea44f?style=for-the-badge" alt="Live Demo">
  </a>
</p>
**"AI recommends. You decide."**

INNOWISE is a minimal, fully working AI HR platform. A recruiter creates a job, and the AI handles the
heavy lifting at every stage — analyzing the role, screening resumes, running an adaptive interview,
and verifying a candidate's claims against public evidence. The recruiter always makes the final call.

---

## 1. What the product does (the 4-stage pipeline)

```
Create job → AI job analysis → Candidate applies (resume) → AI ATS screening
  → Resume verification (claims vs public evidence) → Adaptive AI interview (proctored)
  → HR compares & gets an AI recommendation → Recruiter records the final decision
```

| Stage | What happens |
|-------|--------------|
| **1. AI job analysis** | Recruiter posts a job; AI reads the description and extracts required skills, preferred skills, experience level, and interview competencies. |
| **2. AI ATS screening** | Candidate uploads/pastes a resume. AI extracts a structured profile (skills, experience, projects, education) and reasons over resume-vs-job — a match score, matched skills, skill gaps, and quoted evidence. Not keyword matching — real reasoning. |
| **3. Resume verification** | *Optional, consent-first.* AI extracts professional claims from the resume, checks them against public evidence (GitHub public API; LinkedIn stays self-reported), and scores each claim: VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED / CONTRADICTED / UNVERIFIABLE. Produces a credibility band, a recruiter brief with an honest coverage statement, and lets the candidate explain flagged claims. **Never auto-rejects. Declining is never scored against the candidate.** |
| **4. Adaptive AI interview** | A role-specific, adaptive interview: each question reacts to the previous answer. Camera + microphone start automatically, the session is recorded, and the candidate can dictate answers with speech-to-text. Proctoring (consent gate, fullscreen lock, heartbeat, violation detection) keeps the assessment honest — violations terminate the session and flag it, but HR can always override. |
| **5. HR decision** | HR sees everything per candidate (ATS score, interview evaluation, verification band, proctoring flags), gets an AI comparison + recommendation, and records the final decision. |

---

## 2. Innovation (what's different)

- **Reasoning-based screening, not keyword counting.** The ATS reads like a hiring manager: it quotes
  concrete resume evidence for every matched skill and gap, and scores harshly/calibrated.
- **Resume verification with integrity.** Instead of a black-box "background check", INNOWISE
  surfaces *evidence* (URLs + fetched artifacts + audit trail), scores claims with defined verdicts,
  and lets the candidate respond. The system is designed to **never** accuse a candidate of lying —
  it reports discrepancies with sources.
- **Consent-first, privacy-aware AI.** Verification is opt-in; personal data is stripped before any
  model sees the resume; audit events record every fetch and verdict.
- **Proctored adaptive interviews in the browser.** No external proctoring SaaS — fullscreen lock,
  heartbeat, violation policy, and integrity-based evaluation all run through backend functions with
  a full audit log.
- **Human-in-the-loop by design.** Every AI stage is advisory. There is no code path that rejects a
  candidate automatically.

---

## 3. Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | **React 18 + Vite + TypeScript** |
| Styling | **Tailwind CSS** + **shadcn/ui** (custom warm-amber design tokens) |
| Routing | **React Router v7** |
| Animation | **React Three Fiber (3D briefcase hero), GSAP ScrollTrigger, Lenis** smooth scroll, JetBrains Mono |
| Backend | **Enter Cloud** — managed Postgres database + row-level security + backend functions (Deno) |
| AI | **Enter AI** (LLM structured-JSON output) — model: GPT 5.6 Luna (`openai/gpt-5.6-luna`, Responses protocol) |
| External evidence | **GitHub public API** (unauthenticated, rate-limit aware, graceful degradation) |
| Browser APIs | MediaRecorder (interview recording), Web Speech API (dictation), Fullscreen API + sendBeacon (proctoring) |

---

## 4. Architecture

### Frontend
- `src/pages/hr/*` — HR console: Overview, Jobs, Job detail (pipeline), Candidates, Interviews, Decisions.
- `src/pages/candidate/*` — Candidate console: Dashboard, Apply, Interview.
- `src/components/verification/*` — Resume-verification UI (consent card, report, HR report dialog).
- `src/lib/api.ts` — all data access + backend-function invocations.
- `src/lib/types.ts` — shared row types. `src/lib/status.ts` — status labels/colors.
- `src/context/AuthContext.tsx` + `RequireRole` — auth + role-based routing.

### Backend functions (Deno, one responsibility each)
| Function | Purpose |
|----------|---------|
| `analyze-job` | LLM job analysis → required/preferred skills, competencies |
| `ats-screen` | LLM resume profile + reasoned match score, gaps, evidence |
| `interview-question` | Adaptive interview: next question, scores answers, completes the session, enforces proctoring lock |
| `hr-recommend` | LLM candidate comparison + recommendation across a job's pipeline |
| `proctoring-start / heartbeat / terminate / event` | Interview integrity: session, heartbeat sweep, violation policy, audit |
| `verify-start` | Resume verification consent / decline (opt-in, source handles) |
| `verify-run` | Claim extraction → GitHub public fetch (artifacts) → verdicts → credibility band → recruiter brief |
| `verify-explain` | Candidate explanations for flagged claims (owner-only) |

### Database (Enter Cloud, all tables RLS-enabled)
- `users` (hr/candidate), `organizations`, `jobs` (incl. proctoring config), `candidates`
- `applications` (resume text/URL, status), `evaluations` (ATS + interview), `interviews`, `interview_answers`
- `decisions`, `proctoring_sessions`, `proctoring_events`
- `resume_verifications` + `verification_claims` + `verification_artifacts` + `verification_events`
- Row access is scoped by `can_access_application()` / `is_org_member()` etc. — candidates see only
  their own applications; HR only their organization's. All writes for the AI stages happen
  server-side in backend functions (service role), never on the client.

---

## 5. Running locally

```bash
pnpm install
pnpm dev
```

Type-check / lint / build:

```bash
pnpm check      # eslint + tsc --noEmit
pnpm build      # production build
```

---

## 6. 3–4 minute demo script

**Recommended setup before presenting:** create the HR account and one candidate account, and have a
ready resume (PDF/text) plus the candidate's GitHub username ready to paste. Log out before starting.

### 0:00 – 0:20 · Hook (Innovation)
> "Recruiting is drowning in resumes and biased, black-box tools. INNOWISE is a hiring copilot with a
> difference: the AI does the heavy lifting — analyzing jobs, screening resumes, running interviews,
> and even checking claims against public evidence — but the recruiter makes every final call. No
> auto-rejects. Ever."

### 0:20 – 0:45 · Land + create a job (Tech stack + AI analysis)
- Land on the animated hero (React Three Fiber + GSAP). "Built on React + TypeScript + Tailwind."
- Sign in as HR → **Jobs → Create job** → paste a short description → "Create & run AI analysis".
- Show the extracted **required skills, preferred skills, competencies**.

### 0:45 – 1:20 · Candidate applies → AI screening (Technical execution)
- Switch to the candidate account → **Find jobs → Apply** → upload the resume.
- ATS runs: show the **match score, matched skills, skill gaps, and the AI's quoted evidence**.
  "This isn't keyword matching — the model reasons about the resume against the job and quotes the
  evidence behind every score."

### 1:20 – 2:00 · Resume verification (Innovation + Critical thinking)
- On the candidate dashboard: **Resume verification → consent** → enter the GitHub username.
- Run it: claims get extracted, checked against **public GitHub data** (artifacts with URLs are stored),
  and each gets a verdict. Show the **credibility band, recruiter brief, and coverage statement**
  ("5 of 9 claims checkable via public sources…").
- Key line: "It's consent-first, it never says a candidate lied — it reports discrepancies with
  sources — and candidates can explain flagged claims before the recruiter decides. Declining is not
  scored against them."

### 2:00 – 2:50 · Adaptive AI interview + proctoring (Technical execution)
- HR invites the candidate → **Start interview** (camera + mic start automatically).
- Answer 1–2 questions (use the **dictation** feature to show speech-to-text).
- Mention proctoring: "Fullscreen is locked, a heartbeat tracks the session, and any integrity
  violation terminates the session and flags it for the recruiter — who can still override."

### 2:50 – 3:25 · HR decides (Human-in-the-loop + Presentation)
- Back to HR → job detail: the candidate card now shows ATS score, interview evaluation, and the
  verification band. Run **AI recommendation** → "compare candidates" ranking.
- Record the decision. "AI recommends, HR decides — that's the whole philosophy, and every stage is
  stored and audited."

### 3:25 – 3:40 · Close
> "From job post to hiring decision in one place — with reasoning, evidence, integrity, and a human
> at the center. Thank you."

---

## 7. Demo scoring cheat-sheet (aligns with judging criteria)

- **Innovation** → resume verification with evidence artifacts + candidate explanations; reasoning
  ATS; proctored in-browser interviews; human-in-the-loop everywhere.
- **Technical execution** → React + TypeScript + Tailwind/shadcn, Enter Cloud (Postgres + RLS +
  backend functions), structured-JSON LLM pipeline (GPT 5.6 Luna, Responses protocol), GitHub API
  integration with rate-limit handling, Web APIs (MediaRecorder, Speech, Fullscreen), audit logging.
- **Presentation** → clear story arc (create → screen → verify → interview → decide), real UI with
  live data, one clean demo path (set up accounts + resume before you present).
- **Critical thinking** → mention the trade-offs you handled: GitHub rate limits (graceful
  degradation), LinkedIn without OAuth (self-report, never counted as evidence), verification never
  auto-rejects, no verdict claims beyond the fetched evidence, RLS protecting every table, and that
  the AI is advisory by design.

---

*Project by the INNOWISE team. Deployed via Enter.*
