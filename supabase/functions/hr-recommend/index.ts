// INNOWISE - hr-recommend
// Compares all candidates of a job (ATS + interview results) and returns an
// AI ranking with a recommendation and clear reasoning. AI recommends only;
// the HR user makes the final decision.
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

const SYSTEM_PROMPT = `You are a senior hiring manager at INNOWISE, an AI-powered HR platform.
Compare the candidates for a job opening using their ATS screening results (match score, matched skills, skill gaps) and their AI interview results (score, strengths, weaknesses, competency scores).
Produce a strict JSON object with EXACTLY these fields:
{
  "ranking": [
    { "candidate_id": "uuid", "name": "name", "ats_score": 0-100, "interview_score": 0-100, "rationale": "specific reason this candidate is ranked here" }
  ],
  "recommended_candidate_id": "uuid of the top candidate",
  "summary": "2-4 sentences explaining the overall recommendation with clear reasoning"
}
Rank from best to worst. Weigh interview performance and ATS fit together. Return ONLY valid JSON. No markdown fences, no commentary.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJSON(text: string): Record<string, unknown> {
  let clean = text.trim();
  if (clean.startsWith("```")) {
    const idx = clean.indexOf(NL);
    clean = (idx >= 0 ? clean.slice(idx + 1) : clean.slice(3)).trim();
  }
  if (clean.endsWith("```")) clean = clean.slice(0, -3).trim();
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

interface CandidateRow {
  id: string;
  full_name: string;
  email: string;
  resume_parsed: Record<string, unknown> | null;
}

interface EvalRow {
  application_id: string;
  match_score: number | null;
  matched_skills: string[] | null;
  skill_gaps: string[] | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  competency_scores: Record<string, unknown> | null;
  ai_summary: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("id, organization_id, title, description, required_skills")
      .eq("id", job_id)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) throw new Error("Job not found");

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");
    const caller = await supabase.from("users").select("id, role, organization_id").eq("id", authData.user.id).maybeSingle();
    if (!caller.data || caller.data.role !== "hr" || caller.data.organization_id !== job.organization_id) {
      throw new Error("Unauthorized");
    }

    const { data: apps, error: appsErr } = await supabase
      .from("applications")
      .select("id, candidate_id, status")
      .eq("job_id", job_id);
    if (appsErr) throw appsErr;
    const applications = (apps || []) as { id: string; candidate_id: string; status: string }[];

    if (applications.length === 0) {
      return json({ ok: true, job_id, ranking: [], recommended_candidate_id: null, summary: "No candidates yet." });
    }

    const candidateIds = applications.map((a) => a.candidate_id);
    const appIds = applications.map((a) => a.id);

    const { data: candidates, error: candErr } = await supabase
      .from("candidates")
      .select("id, full_name, email, resume_parsed")
      .in("id", candidateIds);
    if (candErr) throw candErr;

    const { data: evals, error: evErr } = await supabase
      .from("evaluations")
      .select("application_id, match_score, matched_skills, skill_gaps, strengths, weaknesses, competency_scores, ai_summary, type, created_at")
      .in("application_id", appIds);
    if (evErr) throw evErr;
    const evalRows = (evals || []) as (EvalRow & { type: string; created_at: string })[];

    const { data: decisions, error: decErr } = await supabase
      .from("decisions")
      .select("application_id, decision, reason")
      .in("application_id", appIds);
    if (decErr) throw decErr;

    const candidatesById = new Map((candidates || []).map((c: CandidateRow) => [c.id, c]));

    // Build one context block per candidate
    const blocks: string[] = [];
    const applicationByCandidate = new Map<string, string>();
    applications.forEach((a) => applicationByCandidate.set(a.candidate_id, a.id));

    for (const app of applications) {
      const cand = candidatesById.get(app.candidate_id);
      const ats = evalRows
        .filter((e) => e.application_id === app.id && e.type === "ats")
        .sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
      const interview = evalRows
        .filter((e) => e.application_id === app.id && e.type === "interview")
        .sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
      const decision = (decisions || []).find((d) => d.application_id === app.id);

      blocks.push(
        [
          `Candidate: ${cand?.full_name ?? "unknown"} (id ${app.candidate_id})`,
          `Resume profile: ${JSON.stringify(cand?.resume_parsed ?? {})}`,
          `ATS: score ${ats?.match_score ?? "n/a"}, matched ${(ats?.matched_skills || []).join(", ")}, gaps ${(ats?.skill_gaps || []).join(", ")}, verdict: ${ats?.ai_summary ?? "n/a"}`,
          `Interview: score ${interview?.match_score ?? "n/a"}, result ${(interview?.ai_summary ?? "n/a")}, strengths ${(interview?.strengths || []).join(", ")}, weaknesses ${(interview?.weaknesses || []).join(", ")}, competencies ${JSON.stringify(interview?.competency_scores ?? {})}`,
          `HR decision so far: ${decision ? `${decision.decision} (${decision.reason ?? "no reason"})` : "none"}`,
        ].join(NL)
      );
    }

    const result = await callAI(
      SYSTEM_PROMPT,
      `Job: ${job.title}${NL}${job.description}${NL}Required skills: ${(job.required_skills || []).join(", ")}${NL}${NL}${blocks.join(NL + NL)}`
    );

    const ranking = (result.ranking || []) as { candidate_id: string; name: string; ats_score: number; interview_score: number; rationale: string }[];
    const recommended = String(result.recommended_candidate_id || ranking[0]?.candidate_id || "");
    const summary = String(result.summary || "");

    return json({
      ok: true,
      job_id,
      ranking,
      recommended_candidate_id: recommended || null,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
