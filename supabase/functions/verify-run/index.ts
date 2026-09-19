// INNOWISE - verify-run
// Resume verification pipeline:
//   1. LLM extracts concrete professional claims from the resume (privacy-stripped).
//   2. Public evidence is fetched (GitHub public API only; LinkedIn degrades to
//      self-report). Every fetch is stored as an artifact + audit event.
//   3. LLM scores each claim (VERIFIED / PARTIALLY_VERIFIED / UNVERIFIED /
//      CONTRADICTED / UNVERIFIABLE) constrained strictly to the fetched evidence.
//   4. A deterministic credibility band is computed; an LLM writes a recruiter brief.
// This stage is advisory only — it never rejects an application.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "openai/gpt-5.6-luna";
const AI_API_TOKEN = Deno.env.get("AI_API_TOKEN_d24d7797e19e");
const API_BASE = "https://api.enter.pro";
const ENTER_PROJECT_ID = "d24d7797e19e4ea593e540ec0666b2c5";
const NL = String.fromCharCode(10);

const CLAIM_EXTRACT_PROMPT = `You extract concrete, verifiable professional claims from a resume for a background-verification system at INNOWISE.
Rules:
- ONLY professional claims: employment roles, employers, years of experience, claimed skills with proficiency, education degrees and institutions, projects, certifications, notable achievements.
- NEVER output personal contact information: no emails, phone numbers, addresses, or personal social handles.
- Each claim must be a single, concrete, checkable statement (e.g. "Worked as Backend Engineer at Acme for 3 years", "Proficient in Node.js and PostgreSQL", "B.Sc. Computer Science, MIT").
- Use claim_type exactly one of: experience, skill, education, project, certification, other.
Return ONLY valid JSON: {"claims":[{"claim_text":"...","claim_type":"..."}]}. No markdown fences, no commentary.`;

const VERDICT_PROMPT = `You are an evidence-based resume verification analyst at INNOWISE.
Given claims extracted from a resume and a bundle of PUBLIC evidence, decide what the evidence supports for each claim.
Verdict definitions:
- VERIFIED: public evidence clearly supports the claim.
- PARTIALLY_VERIFIED: evidence is consistent with the claim but does not confirm every detail (e.g. activity matches a skill, but employment dates are not provable).
- UNVERIFIED: relevant evidence was examined but did not confirm the claim. This does NOT mean the claim is false.
- CONTRADICTED: evidence conflicts with the claim. Describe exactly what differs and cite the source. NEVER accuse the candidate of lying — report the discrepancy factually.
- UNVERIFIABLE: no public source can reasonably confirm this type of claim (e.g. private employment, internal projects).
Rules:
- Base every verdict ONLY on the evidence provided in the prompt. NEVER invent evidence.
- If there is no evidence relevant to a claim, mark it UNVERIFIABLE and say so.
- Confidence: high / medium / low.
- needs_explanation: true for CONTRADICTED, for UNVERIFIED claims where evidence was checked, and for PARTIALLY_VERIFIED with low confidence. Otherwise false.
Return ONLY valid JSON: {"verdicts":[{"index":0,"verdict":"VERIFIED","confidence":"medium","rationale":"...","evidence_refs":["GitHub repositories: ..."],"needs_explanation":false}]}. "index" must match the input claim index exactly. No markdown fences, no commentary.`;

const BRIEF_PROMPT = `You are a recruiter's assistant at INNOWISE. Produce a concise recruiter brief from resume-verification results.
Return ONLY valid JSON with these fields:
- "summary": 2-3 sentence overview of the verification outcome.
- "coverage": honest statement of how many claims could be checked against which sources, and which could not be verified (e.g. "5 of 9 claims were checked against public GitHub data; 4 were not verifiable via public sources").
- "strengths": array of short strings describing what the evidence supports.
- "flags": array of {claim, issue, sources} only for contradictions or notable discrepancies. Phrase issues factually; NEVER accuse the candidate of lying.
- "interview_suggestions": array of neutral interview questions to discuss flagged or unverified claims.
Rules: base everything ONLY on the provided evidence; never fabricate. This report is advisory and never makes the hiring decision. No markdown fences, no commentary.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJSON(text: string): Record<string, unknown> {
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-zA-Z]*[\r\n]?/, "").replace(/[\r\n]?```$/, "");
  }
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) clean = clean.slice(start, end + 1);
  return JSON.parse(clean);
}

function extractText(data: Record<string, unknown>): string {
  const direct = data.output_text;
  if (typeof direct === "string" && direct) return direct;
  const outputs = Array.isArray(data.output) ? (data.output as Record<string, unknown>[]) : [];
  const parts: string[] = [];
  for (const item of outputs) {
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const block of item.content as Record<string, unknown>[]) {
        if (block.type === "output_text" && typeof block.text === "string") parts.push(block.text);
      }
    }
  }
  return parts.join(NL);
}

async function callAI(system: string, user: string): Promise<Record<string, unknown>> {
  if (!AI_API_TOKEN) throw new Error("AI API token is not configured");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${API_BASE}/code/api/v1/ai/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_TOKEN}`,
        "Content-Type": "application/json",
        "X-Session-ID": crypto.randomUUID(),
        "X-Enter-Project-ID": ENTER_PROJECT_ID,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      let message = "AI service error";
      try {
        const data = await response.json();
        message = data?.error?.message || message;
      } catch {
        /* keep fallback */
      }
      throw new Error(message);
    }

    const data = await response.json();
    const content = extractText(data);
    if (!content) throw new Error("AI returned an empty response");
    try {
      return parseJSON(content);
    } catch {
      // Malformed model output - retry once with the same prompt
    }
  }
  throw new Error("AI returned an invalid response");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip personal/protected data before any model or report sees the resume. */
function stripPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[phone removed]")
    .replace(
      /\b(?:https?:\/\/)?(?:www\.)?(?:twitter|x|facebook|instagram|tiktok|youtube)\.com\/\S+/gi,
      "[personal social removed]"
    );
}

interface GithubData {
  rate_limited: boolean;
  user_found: boolean;
  user: Record<string, unknown> | null;
  repos: Record<string, unknown>[];
  events: Record<string, unknown>[];
  starred: Record<string, unknown>[];
}

/** Fetch public GitHub data for a username (unauthenticated API, 60 req/hr). */
async function fetchGithub(username: string): Promise<GithubData> {
  const out: GithubData = {
    rate_limited: false,
    user_found: false,
    user: null,
    repos: [],
    events: [],
    starred: [],
  };
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "innowise-ats",
  };

  async function get(path: string): Promise<Record<string, unknown>[] | Record<string, unknown> | null> {
    try {
      const res = await fetch(`https://api.github.com${path}`, { headers });
      if (res.status === 403) {
        const remaining = res.headers.get("X-RateLimit-Remaining");
        if (remaining === "0") {
          out.rate_limited = true;
          return null;
        }
      }
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const user = await get(`/users/${username}`);
  if (user && typeof user === "object" && !Array.isArray(user)) {
    out.user_found = true;
    out.user = user as Record<string, unknown>;
  }
  await sleep(300);

  const repos = await get(`/users/${username}/repos?per_page=100&sort=pushed`);
  if (Array.isArray(repos)) out.repos = repos as Record<string, unknown>[];
  await sleep(300);

  if (!out.rate_limited) {
    const events = await get(`/users/${username}/events/public?per_page=30`);
    if (Array.isArray(events)) out.events = events as Record<string, unknown>[];
    await sleep(300);
  }

  if (!out.rate_limited) {
    const starred = await get(`/users/${username}/starred?per_page=30`);
    if (Array.isArray(starred)) out.starred = starred as Record<string, unknown>[];
  }

  return out;
}

function githubEvidence(g: GithubData, username: string): { bundle: string; artifacts: Record<string, unknown>[] } {
  const artifacts: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  if (!g.user_found) {
    return {
      bundle: `GitHub user "${username}" was not found on the public GitHub API. No repository data could be collected.`,
      artifacts: [
        {
          source: "github_public",
          source_url: `https://github.com/${username}`,
          source_label: `GitHub profile (${username})`,
          content: "GitHub user not found.",
          fetched_at: now,
          status: "failed",
        },
      ],
    };
  }

  const parts: string[] = [];
  if (g.user) {
    const u = g.user;
    const profile = {
      login: u.login,
      name: u.name ?? null,
      bio: u.bio ?? null,
      company: u.company ?? null,
      blog: u.blog ?? null,
      location: u.location ?? null,
      public_repos: u.public_repos ?? 0,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
      created_at: u.created_at ?? null,
    };
    parts.push(`Profile: ${JSON.stringify(profile)}`);
    artifacts.push({
      source: "github_public",
      source_url: `https://github.com/${username}`,
      source_label: `GitHub profile (${username})`,
      content: JSON.stringify(profile),
      fetched_at: now,
      status: "fetched",
    });
  }

  if (g.repos.length > 0) {
    const top = g.repos.slice(0, 15).map((r) => ({
      name: r.name,
      description: r.description ?? null,
      language: r.language ?? null,
      stars: r.stargazers_count ?? 0,
      fork: r.fork ?? false,
      pushed_at: r.pushed_at ?? null,
      url: r.html_url ?? null,
    }));
    parts.push(`Repositories (top ${top.length} by latest push): ${JSON.stringify(top)}`);
    artifacts.push({
      source: "github_public",
      source_url: `https://github.com/${username}?tab=repositories`,
      source_label: `GitHub repositories (${username})`,
      content: JSON.stringify(top),
      fetched_at: now,
      status: "fetched",
    });
  }

  if (g.events.length > 0) {
    const typeCount: Record<string, number> = {};
    for (const e of g.events) {
      const t = String(e.type || "Unknown");
      typeCount[t] = (typeCount[t] || 0) + 1;
    }
    const last = g.events.slice(0, 10).map((e) => ({
      type: e.type,
      repo: (e.repo as Record<string, unknown> | undefined)?.name ?? null,
      created_at: e.created_at ?? null,
    }));
    parts.push(`Recent public activity (last 30 events): types=${JSON.stringify(typeCount)}; latest=${JSON.stringify(last)}`);
    artifacts.push({
      source: "github_public",
      source_url: `https://github.com/${username}?tab=overview`,
      source_label: `GitHub public activity (${username})`,
      content: JSON.stringify({ types: typeCount, latest: last }),
      fetched_at: now,
      status: "fetched",
    });
  }

  if (g.starred.length > 0) {
    const starred = g.starred.slice(0, 15).map((s) => ({
      full_name: s.full_name,
      language: s.language ?? null,
      stars: s.stargazers_count ?? 0,
    }));
    parts.push(`Starred repositories (top ${starred.length}): ${JSON.stringify(starred)}`);
    artifacts.push({
      source: "github_public",
      source_url: `https://github.com/${username}?tab=stars`,
      source_label: `GitHub starred repositories (${username})`,
      content: JSON.stringify(starred),
      fetched_at: now,
      status: "fetched",
    });
  }

  if (g.rate_limited) {
    parts.push("NOTE: The GitHub public API rate limit was reached during collection; the evidence above is partial.");
  }

  return { bundle: parts.join(NL), artifacts };
}

function credibilityBand(
  claims: { verdict: string }[],
  contradictedCount: number,
  hasIndependentEvidence: boolean
): { band: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {
    VERIFIED: 0,
    PARTIALLY_VERIFIED: 0,
    UNVERIFIED: 0,
    CONTRADICTED: 0,
    UNVERIFIABLE: 0,
  };
  for (const c of claims) counts[c.verdict] = (counts[c.verdict] || 0) + 1;

  if (!hasIndependentEvidence) {
    return { band: "unknown", counts };
  }

  // Claims that could actually be checked against evidence. UNVERIFIABLE
  // claims (e.g. private employment) are not counted either way — the band
  // must not penalize a candidate for claims no public source can confirm.
  const total = claims.length;
  const checkable =
    counts.VERIFIED + counts.PARTIALLY_VERIFIED + counts.UNVERIFIED + counts.CONTRADICTED;
  const coverage = total > 0 ? checkable / total : 0;
  const ratio = checkable > 0 ? (counts.VERIFIED + counts.PARTIALLY_VERIFIED * 0.5) / checkable : 0;

  let band: string;
  if (contradictedCount > 0) band = "low";
  else if (coverage < 0.35) band = "unknown"; // too little could be checked to assess
  else if (ratio >= 0.6) band = "high";
  else if (ratio >= 0.35) band = "medium";
  else band = "low";
  return { band, counts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let applicationIdFromBody: string | null = null;
  try {
    const body = await req.json();
    const { application_id } = body;
    applicationIdFromBody = application_id || null;
    if (!application_id) throw new Error("application_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // --- Auth: candidate owner OR HR of the job ---
    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");
    const caller = await supabase.from("users").select("id, role, organization_id").eq("id", authData.user.id).maybeSingle();
    if (!caller.data) throw new Error("Unauthorized");

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, job_id, candidate_id, resume_text")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!app) throw new Error("Application not found");

    const ownerCand = await supabase.from("candidates").select("id").eq("user_id", authData.user.id).maybeSingle();
    const isCandidate = !!ownerCand.data && ownerCand.data.id === app.candidate_id;
    const job = await supabase.from("jobs").select("title, organization_id").eq("id", app.job_id).maybeSingle();
    const isHr = caller.data.role === "hr" && job.data?.organization_id === caller.data.organization_id;
    if (!isCandidate && !isHr) throw new Error("Unauthorized");

    // --- Load verification record ---
    const { data: verification } = await supabase
      .from("resume_verifications")
      .select("*")
      .eq("application_id", application_id)
      .maybeSingle();
    if (!verification) throw new Error("Verification not found — the candidate must consent first");
    if (verification.status === "declined") throw new Error("The candidate declined resume verification");
    if (verification.status === "consent_needed") throw new Error("The candidate must consent before verification runs");

    const audit = (eventType: string, detail: Record<string, unknown> = {}) =>
      supabase.from("verification_events").insert({
        verification_id: verification.id,
        application_id,
        actor_user_id: authData.user.id,
        event_type: eventType,
        detail,
      });

    // --- Mark analyzing, clear previous run's outputs (audit history is kept) ---
    await supabase.from("resume_verifications").update({ status: "analyzing", updated_at: new Date().toISOString() }).eq("id", verification.id);
    await supabase.from("verification_claims").delete().eq("verification_id", verification.id);
    await supabase.from("verification_artifacts").delete().eq("verification_id", verification.id);
    await audit("analyze_started", { run: (verification.run_count || 0) + 1 });

    if (!app.resume_text || app.resume_text.trim().length < 20) {
      throw new Error("Resume text is missing or too short to verify");
    }

    // --- Step 1: privacy strip + LLM claim extraction ---
    const cleanResume = stripPersonal(app.resume_text);
    const claimsResult = await callAI(CLAIM_EXTRACT_PROMPT, cleanResume);
    const rawClaims = Array.isArray(claimsResult.claims) ? claimsResult.claims as Record<string, unknown>[] : [];
    const claims = rawClaims
      .map((c) => ({
        claim_text: String(c.claim_text || "").trim(),
        claim_type: ["experience", "skill", "education", "project", "certification", "other"].includes(String(c.claim_type))
          ? String(c.claim_type)
          : "other",
      }))
      .filter((c) => c.claim_text.length > 0)
      .slice(0, 20);

    if (claims.length === 0) throw new Error("No verifiable claims could be extracted from the resume");
    await audit("claims_extracted", { count: claims.length });

    // --- Step 2: fetch public evidence (GitHub only; LinkedIn stays self-reported) ---
    const sources = Array.isArray(verification.sources_available) ? verification.sources_available as string[] : [];
    const hasGithub = sources.includes("github_public") && !!verification.github_username;
    const hasLinkedin = sources.includes("linkedin_self_report") && !!verification.linkedin_url;

    let github: GithubData | null = null;
    let evidenceBundle = "";
    let artifacts: Record<string, unknown>[] = [];
    let hasIndependentEvidence = false;

    if (hasGithub) {
      github = await fetchGithub(verification.github_username as string);
      const gh = githubEvidence(github, verification.github_username as string);
      evidenceBundle = gh.bundle;
      artifacts = gh.artifacts;
      hasIndependentEvidence = github.user_found || artifacts.some((a) => a.status === "fetched");
      if (github.rate_limited) {
        await audit("github_rate_limited", { username: verification.github_username });
      } else if (github.user_found) {
        await audit("github_fetch_complete", { username: verification.github_username, repos: github.repos.length });
      } else {
        await audit("github_user_not_found", { username: verification.github_username });
      }
    }

    if (!evidenceBundle) {
      evidenceBundle = "No independent public evidence was available. LinkedIn data (if provided) is self-reported by the candidate and is not independent evidence.";
    } else if (hasLinkedin) {
      evidenceBundle += `${NL}NOTE: The candidate also provided a LinkedIn profile (self-reported). LinkedIn data is NOT treated as independent evidence because it is candidate-supplied.`;
    }

    // --- Step 3: LLM verdicts constrained to the evidence ---
    const claimsForModel = claims.map((c, i) => `${i}. [${c.claim_type}] ${c.claim_text}`).join(NL);
    const verdictsResult = await callAI(VERDICT_PROMPT, `CLAIMS:${NL}${claimsForModel}${NL}${NL}PUBLIC EVIDENCE:${NL}${evidenceBundle}`);
    const rawVerdicts = Array.isArray(verdictsResult.verdicts) ? verdictsResult.verdicts as Record<string, unknown>[] : [];

    const claimRows = claims.map((c, i) => {
      const v = rawVerdicts.find((rv) => Number(rv.index) === i) || {};
      const verdict = ["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "CONTRADICTED", "UNVERIFIABLE"].includes(String(v.verdict))
        ? String(v.verdict)
        : "UNVERIFIABLE";
      const confidence = ["high", "medium", "low"].includes(String(v.confidence)) ? String(v.confidence) : "low";
      const needsExplanation = Boolean(v.needs_explanation) ||
        verdict === "CONTRADICTED" ||
        (verdict === "UNVERIFIED" && hasIndependentEvidence);
      return {
        application_id,
        claim_text: c.claim_text,
        claim_type: c.claim_type,
        verdict,
        confidence,
        rationale: String(v.rationale || ""),
        evidence: Array.isArray(v.evidence_refs) ? v.evidence_refs.map((r) => ({ source: String(r) })) : [],
        explanation_status: needsExplanation ? "requested" : "not_requested",
      };
    });

    // --- Step 4: credibility band (deterministic) ---
    const contradictedCount = claimRows.filter((r) => r.verdict === "CONTRADICTED").length;
    const { band, counts } = credibilityBand(claimRows, contradictedCount, hasIndependentEvidence);

    // --- Step 5: recruiter brief (LLM, advisory) ---
    const verdictSummary = claimRows.map((r, i) => `${i}. ${r.verdict} (${r.confidence}): ${r.claim_text}`).join(NL);
    const briefResult = await callAI(
      BRIEF_PROMPT,
      `Job title: ${job.data?.title || "unknown"}${NL}${NL}CLAIMS & VERDICTS:${NL}${verdictSummary}${NL}${NL}EVIDENCE USED:${NL}${evidenceBundle.slice(0, 6000)}`
    );
    const brief = {
      summary: String(briefResult.summary || ""),
      coverage: String(briefResult.coverage || ""),
      strengths: Array.isArray(briefResult.strengths) ? briefResult.strengths.map((s) => String(s)) : [],
      flags: Array.isArray(briefResult.flags)
        ? briefResult.flags.map((f) => ({
            claim: String((f as Record<string, unknown>).claim || ""),
            issue: String((f as Record<string, unknown>).issue || ""),
            sources: Array.isArray((f as Record<string, unknown>).sources) ? (f as Record<string, unknown>).sources as string[] : [],
          }))
        : [],
      interview_suggestions: Array.isArray(briefResult.interview_suggestions)
        ? briefResult.interview_suggestions.map((s) => String(s))
        : [],
    };

    // --- Persist ---
    for (const row of claimRows) {
      const { error } = await supabase
        .from("verification_claims")
        .insert({ ...row, verification_id: verification.id })
        .select("id")
        .single();
      if (error) throw error;
    }

    for (const a of artifacts) {
      await supabase.from("verification_artifacts").insert({ ...a, verification_id: verification.id, application_id });
    }
    await audit("verdicts_issued", { counts, total: claimRows.length });
    if (hasIndependentEvidence) await audit("github_evidence_used", {});

    const report = {
      claim_counts: counts,
      total_claims: claimRows.length,
      credibility_band: band,
      sources_used: hasIndependentEvidence ? ["github_public"] : [],
      linkedin_self_reported: hasLinkedin,
      rate_limited: github?.rate_limited ?? false,
      generated_at: new Date().toISOString(),
    };

    const { error: finalErr } = await supabase
      .from("resume_verifications")
      .update({
        status: "ready",
        credibility_band: band,
        report,
        recruiter_brief: brief,
        run_count: (verification.run_count || 0) + 1,
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", verification.id);
    if (finalErr) throw finalErr;
    await audit("report_ready", { band, claims: claimRows.length });

    return json({
      ok: true,
      verification_id: verification.id,
      status: "ready",
      credibility_band: band,
      claim_count: claimRows.length,
      report,
      recruiter_brief: brief,
    });
  } catch (err) {
    const obj = (err ?? {}) as { message?: unknown };
    const raw = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error("verify-run failed:", raw, err instanceof Error ? err.stack || "" : "");
    const message = typeof obj.message === "string" && obj.message ? obj.message : "Unknown error";
    // On failure, return the verification to a retryable state (keep the record).
    try {
      if (applicationIdFromBody) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") || "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        );
        const app_id = applicationIdFromBody;
        const { data: rv } = await supabase.from("resume_verifications").select("id").eq("application_id", app_id).maybeSingle();
        await supabase.from("resume_verifications").update({ status: "consent_given", updated_at: new Date().toISOString() }).eq("application_id", app_id);
        await supabase.from("verification_events").insert({
          verification_id: rv?.id ?? null,
          application_id: app_id,
          event_type: "analyze_failed",
          detail: { error: message, raw: String(raw).slice(0, 800) },
        });
      }
    } catch {
      /* best-effort */
    }
    return json({ ok: false, error: message }, 400);
  }
});
