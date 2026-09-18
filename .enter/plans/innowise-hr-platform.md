# INNOWISE — AI-Powered HR Workforce Management Platform

## Context

Build INNOWISE from scratch for a hackathon: a minimal, fully functional AI HR platform where HR creates jobs, AI analyzes them, candidates apply with resumes, AI screens (ATS) and conducts an adaptive interview, HR compares candidates with an AI recommendation and records a final decision, and candidates track everything from their own dashboard.

The current project is a fresh Vite + React + shadcn + TypeScript template with **no backend** (Enter Cloud not enabled, no AI capability). Everything below is new. Only 4 core features, no extra infrastructure.

**Decisions confirmed with user:**
- Auth: Email + password (signup + login), role selected at signup (HR / Candidate)
- AI model: **GPT 5.6 Luna** (`openai/gpt-5.6-luna`, openai_chat_completions protocol)
- Resume upload: PDF + TXT with client-side text extraction (pdfjs-dist)

## Architecture

- **Frontend**: React + TS pages under `src/pages/`, shadcn UI components, role-guarded routes, Tailwind design tokens (indigo/blue professional theme).
- **Backend**: Enter Cloud (auth, Postgres DB, storage bucket `resumes`, 4 backend functions).
- **AI**: All AI work runs in backend functions via Enter AI chat/completions API (`stream: false`, structured JSON output), model `openai/gpt-5.6-luna`.
- **Storage**: public bucket `resumes` for candidate resume files.
- **Role model**: `users.role` ∈ `hr` | `candidate`. HR owns an `organization`; candidates apply to its jobs. RLS scopes rows per role; write-side mutations for screening/interview run in backend functions (service role).

### Data flow
HR signs up → creates org → creates Job → AI `analyze-job` → Candidate applies (uploads/pastes resume → text extracted → stored) → AI `ats-screen` → HR invites interview → AI `interview-question` (adaptive, 5 questions, evaluates each answer) → HR `hr-recommend` compares candidates → HR records `decision` → Candidate dashboard shows everything.

## Implementation checklist

- [ ] **Enable backend**: call `supabase_enable` (Enter Cloud), then `enable_ai_capability`. Reload `enter_llm_integration` skill afterwards to capture resolved API base / AI token secret / project ID, and verify GPT 5.6 Luna's `Protocol` value; read the matching protocol reference before writing functions.
- [ ] **Configure auth**: `supabase_configure_auth` → email signups with auto-confirm.
- [ ] **Migration — tables + RLS** (via `supabase_migration`): create `organizations`, `users` (id→auth.users, role check hr/candidate, full_name, email, organization_id), `jobs` (org, title, description, required_skills text[], experience_years, responsibilities, status, ai_analysis jsonb), `candidates` (user_id, full_name, email, resume_url, resume_parsed jsonb), `applications` (job_id, candidate_id, resume_url, resume_text, status, ats_status, unique job+candidate), `evaluations` (application_id, type ats|interview, match_score, matched_skills, skill_gaps, strengths, weaknesses, competency_scores jsonb, evidence, ai_summary, raw jsonb), `interviews` (application_id, status invited|in_progress|completed, question_count), `interview_answers` (interview_id, question, question_type, focus, answer, score, feedback), `decisions` (application_id, decision proceed|hold|reject, hr_user_id, reason, ai_recommendation jsonb). Enable RLS in the same migration.
- [ ] **RLS policies**: `users` own-row only; `organizations` HR own-org; `jobs` HR-org + candidates read open jobs; `candidates` self + HR-of-org (via job/applications subquery); `applications`/`evaluations`/`interviews`/`interview_answers`/`decisions` scoped to candidate-self or HR-of-org. Verify with `supabase_get_table_schema` that RLS is on and policies exist.
- [ ] **Storage**: create public bucket `resumes` (10 MB, pdf/txt) + read/upload policies. Resume text extraction client-side via `pdfjs-dist` (add dependency) for PDFs; `.txt` read directly.
- [ ] **Backend function `analyze-job`**: reads job by id, AI extracts `{ required_skills, preferred_skills, experience, competencies }`, writes `jobs.ai_analysis`. CORS + OPTIONS, `Deno.serve`, AI token via `Deno.env.get`, `supabase.functions.invoke` from client.
- [ ] **Backend function `ats-screen`**: loads application (job + resume_text), AI extracts resume `{ name, skills, experience, projects, education }` AND matches vs JD producing `{ match_score, matched_skills, skill_gaps, evidence, summary }` in one reasoned call (no keyword-only matching). Writes `candidates.resume_parsed`, `evaluations` (type ats), sets application `ats_status=done`, `status=screening_done`.
- [ ] **Backend function `interview-question`**: idempotent per step. Creates interview + first question on invite; on each answer evaluates it (score 1-10, feedback, updated per-skill confidence) and generates the next adaptive question from JD + resume + previous answers; after 5 questions produces final evaluation `{ result, strengths, weaknesses, overall_score, competency_scores }` → `evaluations` (type interview), interview `completed`, application `interview_done`.
- [ ] **Backend function `hr-recommend`**: loads all candidates/applications/evals for a job, AI returns `{ ranking: [{candidate_id, rationale}], recommended_candidate_id, summary }`.
- [ ] **Auth UI**: `Login` and `Signup` pages (name, email, password, role toggle HR/Candidate). After signup: HR creates organization and updates own `users.organization_id`; Candidate inserts own `candidates` row. `AuthContext` holds user+session+profile; register `onAuthStateChange` before session restore; pass `emailRedirectTo: ${window.location.origin}/`.
- [ ] **Route guards**: `RequireRole` wrapper; `/hr/*` HR-only, `/candidate/*` candidate-only, `/` redirects by role, unauthenticated → login.
- [ ] **HR layout + pages** (`src/pages/hr/`): `HrLayout` with sidebar (Overview, Jobs, Candidates, Interviews, Decisions); `Overview` (stats: open jobs, candidates, avg match, interviews, decisions); `Jobs` (list + create-job dialog → triggers analyze-job); `JobDetail` (AI analysis, candidate list w/ match scores + skill gaps, invite-interview, compare + AI recommendation, record decision); `Candidates`; `Interviews` (status + answer review); `Decisions` (final decision table).
- [ ] **Candidate layout + pages** (`src/pages/candidate/`): `CandidateLayout`; `Dashboard` (profile, applied jobs, application/ATS status, interview invitation + progress + result, skill gaps, recommended skills); `Apply` (browse open jobs, upload/paste resume, apply → runs ATS); `Interview` (one-question-at-a-time flow, answer → next question → final result).
- [ ] **Router**: register all routes above the catch-all; keep `Index` as a lightweight landing that redirects by auth/role.
- [ ] **Design tokens** (`src/index.css`, `tailwind.config.ts`): professional indigo/blue primary + semantic tokens (gradient, subtle panel bg, glow shadow), dark/light safe; reuse existing shadcn components (sidebar, card, table, badge, progress, dialog, textarea, input, select, skeleton, toast).
- [ ] **Frontend data layer**: `src/lib/types.ts` (row types), `src/lib/api.ts` (typed `supabase.functions.invoke` + list queries with `.maybeSingle()`), import `supabase` from generated `src/integrations/supabase/client.ts` (do not edit it).
- [ ] Run `code-review` and `find-bugs` skills against the implementation before final verification.

## Files

- New/modified frontend: `src/pages/**`, `src/router.tsx`, `src/lib/types.ts`, `src/lib/api.ts`, `src/context/AuthContext.tsx`, `src/index.css`, `tailwind.config.ts`.
- New backend: `supabase/functions/{analyze-job,ats-screen,interview-question,hr-recommend}/index.ts`.
- Generated by platform: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts` (never edit).
- Reuse existing: shadcn components in `src/components/ui/`, `src/lib/utils.ts` (`cn`), `src/App.tsx` providers.

## Verification checklist

- [ ] `pnpm check` (eslint + `tsc --noEmit`) and `pnpm run build` pass.
- [ ] E2E demo in preview with two accounts: HR signup → creates org → creates "Senior Backend Developer" → AI analysis saved (`jobs.ai_analysis` non-null).
- [ ] Candidate signup → applies with a PDF and with a TXT resume → ATS done: `match_score`, `matched_skills`, `skill_gaps`, `evidence` populated by real AI (no fake/mock values).
- [ ] HR invites interview → 5 adaptive questions generated; candidate answers → each gets score/feedback; final interview evaluation written; application becomes `interview_done`.
- [ ] HR job detail shows comparison + AI recommendation; recording proceed/hold/reject persists a `decisions` row.
- [ ] Candidate dashboard shows only own applications with statuses, skill gaps, interview result; candidate gets HTTP/route-blocked from `/hr/*`; HR blocked from `/candidate/*`.
- [ ] Negative checks: duplicate application rejected (unique job+candidate), empty/oversized resume file rejected, candidate with no application sees empty state, AI error surfaces the backend message.
