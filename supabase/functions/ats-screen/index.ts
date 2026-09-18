// INNOWISE - ats-screen
// AI ATS screening: extracts the resume into a structured profile and
// reasons over JD vs resume to produce a match score, matched skills,
// skill gaps and evidence. Reasoning-based, not keyword matching.
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

const SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) screener at INNOWISE, an AI-powered HR platform.
You read a resume and a job description, then reason like a hiring manager — you do NOT do simple keyword matching.
Produce a strict JSON object with EXACTLY these fields:
{
  "profile": {
    "name": "candidate name or empty string",
    "email": "email or empty string",
    "skills": ["skills mentioned in the resume"],
    "experience": "concise experience summary, e.g. '4 years backend development, Node.js + PostgreSQL'",
    "projects": ["notable projects"],
    "education": "highest education"
  },
  "match": {
    "match_score": 0-100 integer reflecting true fit (skills, depth of experience, relevance of projects),
    "matched_skills": ["job skills the candidate genuinely demonstrates, with evidence in the resume"],
    "skill_gaps": ["job skills missing or weak in the resume"],
    "evidence": "specific reasoning: quote concrete resume evidence for each matched skill and each gap",
    "summary": "one short paragraph verdict from a hiring manager perspective"
  }
}
Calibrate the score harshly: a resume that only partially covers the JD should score 40-65, a strong full match 80+. Return ONLY valid JSON. No markdown fences, no commentary.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJSON(text: string): Record<string, unknown> {
  let clean = text.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
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

interface AppRow {
  id: string;
  job_id: string;
  candidate_id: string;
  resume_text: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { application_id } = await req.json();
    if (!application_id) throw new Error("application_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { data: app, error } = await supabase
      .from("applications")
      .select("id, job_id, candidate_id, resume_text")
      .eq("id", application_id)
      .maybeSingle<AppRow>();

    if (error) throw error;
    if (!app) throw new Error("Application not found");
    if (!app.resume_text || app.resume_text.trim().length < 20) {
      throw new Error("Resume text is missing or too short to analyze");
    }

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("organization_id, title, description, required_skills, experience_years, responsibilities, ai_analysis")
      .eq("id", app.job_id)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job) throw new Error("Job not found");

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");
    const caller = await supabase.from("users").select("id, role, organization_id").eq("id", authData.user.id).maybeSingle();
    if (!caller.data) throw new Error("Unauthorized");

    const ownerCand = await supabase.from("candidates").select("id").eq("user_id", caller.data.id).maybeSingle();
    const isCandidate = ownerCand.data && ownerCand.data.id === app.candidate_id;
    const isHr = caller.data.role === "hr" && job.organization_id === caller.data.organization_id;
    if (!isCandidate && !isHr) throw new Error("Unauthorized");

    const { error: procErr } = await supabase
      .from("applications")
      .update({ ats_status: "processing" })
      .eq("id", application_id);
    if (procErr) throw procErr;

    const jobText = [
      `Job title: ${job.title}`,
      `Job description: ${job.description}`,
      `Required skills: ${(job.required_skills || []).join(", ")}`,
      `Experience: ${job.experience_years} years`,
      `Responsibilities: ${job.responsibilities}`,
    ].join("\n");

    const userPrompt = `JOB POSTING
${jobText}

CANDIDATE RESUME
${app.resume_text}`;

    const result = await callAI(SYSTEM_PROMPT, userPrompt);
    const profile = (result.profile || {}) as Record<string, unknown>;
    const match = (result.match || {}) as Record<string, unknown>;

    const score = Number(match.match_score);
    const matchedSkills = (match.matched_skills || []) as string[];
    const skillGaps = (match.skill_gaps || []) as string[];

    if (Number.isNaN(score)) throw new Error("AI returned an invalid match score");

    // Update candidate parsed profile
    const { error: candErr } = await supabase
      .from("candidates")
      .update({ resume_parsed: profile })
      .eq("id", app.candidate_id);
    if (candErr) throw candErr;

    // Store ATS evaluation
    const { error: evErr } = await supabase.from("evaluations").insert({
      application_id: application_id,
      type: "ats",
      match_score: Math.max(0, Math.min(100, Math.round(score))),
      matched_skills: matchedSkills,
      skill_gaps: skillGaps,
      evidence: String(match.evidence || ""),
      ai_summary: String(match.summary || ""),
      raw: result,
    });
    if (evErr) throw evErr;

    // Mark application as screened
    const { error: doneErr } = await supabase
      .from("applications")
      .update({ ats_status: "done", status: "screening_done" })
      .eq("id", application_id);
    if (doneErr) throw doneErr;

    return json({
      ok: true,
      application_id,
      profile,
      match_score: Math.round(score),
      matched_skills: matchedSkills,
      skill_gaps: skillGaps,
      evidence: match.evidence || "",
      summary: match.summary || "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Mark the application as failed so the UI can show a retryable state
    try {
      const { application_id } = await req.json().catch(() => ({}));
      if (application_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") || "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        );
        await supabase.from("applications").update({ ats_status: "failed" }).eq("id", application_id);
      }
    } catch {
      /* best-effort */
    }
    return json({ ok: false, error: message }, 400);
  }
});
