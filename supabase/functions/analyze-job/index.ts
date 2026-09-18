// INNOWISE - analyze-job
// AI analysis of a job description: extracts required/preferred skills,
// experience recommendation and interview competencies.
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

const SYSTEM_PROMPT = `You are a senior technical recruiter at INNOWISE, an AI-powered HR platform.
Analyze the provided job posting and produce a strict JSON object with EXACTLY these fields:
{
  "required_skills": ["at least 5 core skills clearly demanded by the role"],
  "preferred_skills": ["nice-to-have skills mentioned or implied"],
  "experience": "clear experience recommendation, e.g. '5+ years building backend services'",
  "competencies": ["5 interview competencies to probe, e.g. System Design, Database Performance, Code Quality, Distributed Systems, Problem Solving"]
}
Return ONLY valid JSON. No markdown fences, no commentary.`;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { data: job, error } = await supabase
      .from("jobs")
      .select("id, organization_id, title, description, required_skills, experience_years, responsibilities")
      .eq("id", job_id)
      .maybeSingle();

    if (error) throw error;

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");
    const caller = await supabase.from("users").select("id, role, organization_id").eq("id", authData.user.id).maybeSingle();
    if (!caller.data) throw new Error("Unauthorized");
    if (!job) throw new Error("Job not found");

    if (caller.data.role !== "hr" || caller.data.organization_id !== job.organization_id) throw new Error("Unauthorized");

    const userPrompt = [
      `Job title: ${job.title}`,
      `Job description: ${job.description}`,
      `Required skills listed by HR: ${(job.required_skills || []).join(", ")}`,
      `Years of experience required: ${job.experience_years}`,
      `Responsibilities: ${job.responsibilities}`,
    ].join("\n\n");

    const analysis = await callAI(SYSTEM_PROMPT, userPrompt);

    const { error: updErr } = await supabase
      .from("jobs")
      .update({ ai_analysis: analysis })
      .eq("id", job_id);
    if (updErr) throw updErr;

    return json({ ok: true, job_id, analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
