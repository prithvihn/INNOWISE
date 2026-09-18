// INNOWISE - interview-question
// Adaptive AI interview:
//  - start: creates an interview and generates the first question
//  - answer: evaluates the candidate's answer, updates skill confidence,
//    generates the next adaptive question, and after 5 questions produces
//    the final interview evaluation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "openai/gpt-5.6-luna";
const AI_API_TOKEN = Deno.env.get("AI_API_TOKEN_d24d7797e19e");
const API_BASE = "https://api.enter.pro";
const ENTER_PROJECT_ID = "d24d7797e19e4ea593e540ec0666b2c5";
const MAX_QUESTIONS = 5;
const NL = String.fromCharCode(10);

const FIRST_QUESTION_PROMPT = `You are an expert technical interviewer at INNOWISE, an AI-powered HR platform, about to interview a candidate for a specific role.
Generate the FIRST interview question. Start by probing the most critical skill gap or the single most important requirement of the role.
Output strict JSON with EXACTLY these fields:
{
  "question": "one focused interview question",
  "question_type": "technical" | "behavioral" | "skill-gap",
  "focus": "what this question targets"
}
Return ONLY valid JSON. No markdown fences, no commentary.`;

const EVALUATE_PROMPT = `You are an expert technical interviewer at INNOWISE conducting an adaptive AI interview.
The candidate just answered the most recent question. Evaluate that answer for technical accuracy, depth, clarity and role fit.
Also generate the NEXT adaptive question: it must adapt to the candidate's previous answers, probing their weakest area or remaining skill gaps.
Output strict JSON with EXACTLY these fields:
{
  "score": 1-10 integer,
  "feedback": "2-3 sentences on what was strong and weak, specific to the answer",
  "next_question": {
    "question": "the next adaptive interview question",
    "question_type": "technical" | "behavioral" | "skill-gap",
    "focus": "what this next question targets"
  }
}
Return ONLY valid JSON. No markdown fences, no commentary.`;

const FINAL_PROMPT = `You are a senior hiring manager at INNOWISE. Given a completed adaptive interview transcript for a role, produce the final evaluation.
Output strict JSON with EXACTLY these fields:
{
  "result": "pass" | "consider" | "no",
  "overall_score": 1-100 integer,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "competency_scores": { "competency name": 1-10 },
  "summary": "2-3 sentence hiring recommendation with clear reasoning"
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

interface AnswerRow {
  id: string;
  question: string;
  question_type: string;
  focus: string | null;
  answer: string | null;
  score: number | null;
  feedback: string | null;
}

function conversationText(answers: AnswerRow[]): string {
  const lines: string[] = [];
  answers.forEach((a, i) => {
    lines.push(`Q${i + 1}: ${a.question}`);
    lines.push(`A${i + 1}: ${a.answer ?? "(no answer yet)"}`);
    if (a.score) lines.push(`(evaluated ${a.score}/10: ${a.feedback ?? ""})`);
    lines.push("");
  });
  return lines.join(NL);
}

function buildContext(job: Record<string, unknown>, resume: Record<string, unknown>, gaps: string[]): string {
  const requiredSkills = (job.required_skills as string[]) || [];
  const lines = [
    `Role: ${job.title}`,
    `Job description: ${job.description}`,
    `Required skills: ${requiredSkills.join(", ")}`,
  ];
  if (job.ai_analysis) {
    const ai = job.ai_analysis as Record<string, unknown>;
    if (Array.isArray(ai.competencies)) {
      lines.push(`Competencies to probe: ${(ai.competencies as string[]).join(", ")}`);
    }
  }
  lines.push(
    `Candidate resume: ${JSON.stringify(resume)}`,
    `Identified skill gaps: ${gaps.length ? gaps.join(", ") : "none"}`
  );
  return lines.join(NL);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    let application_id = body.application_id as string | undefined;
    const interview_id = body.interview_id as string | undefined;
    const answer_id = body.answer_id as string | undefined;
    const answer = body.answer as string | undefined;

    if (!application_id && !interview_id) throw new Error("application_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Resolve application_id from the interview when only interview_id is given
    if (!application_id && interview_id) {
      const { data: iv, error: ivErr } = await supabase
        .from("interviews")
        .select("application_id")
        .eq("id", interview_id)
        .maybeSingle();
      if (ivErr) throw ivErr;
      if (!iv) throw new Error("Interview not found");
      application_id = iv.application_id as string;
    }

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, job_id, candidate_id")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!app) throw new Error("Application not found");

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");
    const caller = await supabase.from("users").select("id, role, organization_id").eq("id", authData.user.id).maybeSingle();
    if (!caller.data) throw new Error("Unauthorized");
    const ownerCand = await supabase.from("candidates").select("id").eq("user_id", caller.data.id).maybeSingle();
    const isCandidate = ownerCand.data && ownerCand.data.id === app.candidate_id;
    const jobOrg = await supabase.from("jobs").select("organization_id").eq("id", app.job_id).maybeSingle();
    const isHr = caller.data.role === "hr" && jobOrg.data && jobOrg.data.organization_id === caller.data.organization_id;
    if (!isCandidate && !isHr) throw new Error("Unauthorized");

    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select("title, description, required_skills, ai_analysis")
      .eq("id", app.job_id)
      .maybeSingle();
    if (jobErr) throw jobErr;
    if (!job) throw new Error("Job not found");

    const { data: candidate, error: candErr } = await supabase
      .from("candidates")
      .select("resume_parsed")
      .eq("id", app.candidate_id)
      .maybeSingle();
    if (candErr) throw candErr;

    const resumeParsed = (candidate?.resume_parsed || {}) as Record<string, unknown>;

    // ATS evaluation provides the skill gaps
    const { data: atsEval } = await supabase
      .from("evaluations")
      .select("skill_gaps")
      .eq("application_id", application_id)
      .eq("type", "ats")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const skillGaps = (atsEval?.skill_gaps as string[]) || [];

    // ------------------------------------------------------------
    // FIND OR CREATE THE INTERVIEW
    // ------------------------------------------------------------
    let interview: Record<string, unknown> | null = null;
    const { data: existing } = await supabase
      .from("interviews")
      .select("id, status, completed_at")
      .eq("application_id", application_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (existing.status === "completed") {
        // Interview already finished - return stored evaluation
        const { data: evalRow } = await supabase
          .from("evaluations")
          .select("*")
          .eq("application_id", application_id)
          .eq("type", "interview")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return json({ ok: true, phase: "complete", interview_id: existing.id, result: evalRow || null });
      }
      interview = existing;
    }

    // If we are in "answer" mode the interview must exist
    if (interview_id && !interview) throw new Error("Interview not found");

    if (!interview) {
      // -------- START: create interview + first question --------
      const { data: created, error: intErr } = await supabase
        .from("interviews")
        .insert({ application_id, status: "in_progress", question_count: 0 })
        .select()
        .single();
      if (intErr) throw intErr;
      interview = created;

      const ai = await callAI(FIRST_QUESTION_PROMPT, buildContext(job, resumeParsed, skillGaps));
      const question = (ai.question || "Tell me about your experience relevant to this role.") as string;
      const question_type = (ai.question_type || "technical") as string;
      const focus = (ai.focus || question_type) as string;

      const { data: qRow, error: qErr } = await supabase
        .from("interview_answers")
        .insert({ interview_id: interview.id, question, question_type, focus })
        .select()
        .single();
      if (qErr) throw qErr;

      return json({
        ok: true,
        phase: "question",
        interview_id: interview.id,
        answer_id: qRow.id,
        question_index: 1,
        total: MAX_QUESTIONS,
        question,
        question_type,
        focus,
      });
    }

    // -------- ANSWER mode --------
    if (!answer_id || !answer) throw new Error("answer_id and answer are required");
    if (answer.trim().length < 10) throw new Error("Answer is too short");

    const { data: answers, error: ansErr } = await supabase
      .from("interview_answers")
      .select("id, question, question_type, focus, answer, score, feedback")
      .eq("interview_id", interview.id)
      .order("created_at", { ascending: true });
    if (ansErr) throw ansErr;
    const rows = (answers as AnswerRow[]) || [];

    const target = rows.find((r) => r.id === answer_id);
    if (!target) throw new Error("Answer record not found");
    if (target.answer) throw new Error("This question has already been answered");

    const answered = [...rows, { ...target, answer }].filter((r) => r.answer && r.answer.trim());
    const answeredCount = answered.length;

    // Evaluate the answer + generate next question BEFORE persisting, so a
    // transient AI failure does not leave the question half-answered
    const ai = await callAI(
      EVALUATE_PROMPT,
      `${buildContext(job, resumeParsed, skillGaps)}${NL}${NL}INTERVIEW TRANSCRIPT SO FAR${NL}${conversationText(answered)}`
    );

    const score = Math.max(1, Math.min(10, Math.round(Number(ai.score) || 5)));
    const feedback = String(ai.feedback || "");

    const { error: scErr } = await supabase
      .from("interview_answers")
      .update({ answer, score, feedback })
      .eq("id", answer_id);
    if (scErr) throw scErr;

    const next = (ai.next_question || {}) as Record<string, unknown>;

    if (answeredCount < MAX_QUESTIONS) {
      // Still more questions to ask
      const question = String(next.question || "Tell me more about that experience.");
      const question_type = String(next.question_type || "technical");
      const focus = String(next.focus || question_type);

      const { data: nextRow, error: nqErr } = await supabase
        .from("interview_answers")
        .insert({ interview_id: interview.id, question, question_type, focus })
        .select()
        .single();
      if (nqErr) throw nqErr;

      const { error: cntErr } = await supabase
        .from("interviews")
        .update({ question_count: answeredCount })
        .eq("id", interview.id);
      if (cntErr) throw cntErr;

      return json({
        ok: true,
        phase: "question",
        interview_id: interview.id,
        answer_id: nextRow.id,
        question_index: answeredCount + 1,
        total: MAX_QUESTIONS,
        question,
        question_type,
        focus,
        last_evaluation: { score, feedback },
      });
    }

    // -------- FINAL: last question answered -> evaluate whole interview --------
    const fullAnswers = [...answered].map((r) => r.answer ?? "");
    const finalAi = await callAI(
      FINAL_PROMPT,
      `${buildContext(job, resumeParsed, skillGaps)}${NL}${NL}COMPLETED INTERVIEW TRANSCRIPT${NL}${conversationText(answered)}${NL}${NL}The candidate's answers in order:${NL}${fullAnswers.map((a, i) => `${i + 1}. ${a}`).join(NL)}`
    );

    const result = String(finalAi.result || "consider");
    const overall = Math.max(0, Math.min(100, Math.round(Number(finalAi.overall_score) || 0)));
    const strengths = (finalAi.strengths || []) as string[];
    const weaknesses = (finalAi.weaknesses || []) as string[];
    const competencyScores = (finalAi.competency_scores || {}) as Record<string, unknown>;
    const summary = String(finalAi.summary || "");

    const { error: evErr } = await supabase.from("evaluations").insert({
      application_id,
      type: "interview",
      match_score: overall,
      strengths,
      weaknesses,
      competency_scores: competencyScores,
      ai_summary: summary,
      evidence: summary,
      raw: finalAi,
    });
    if (evErr) throw evErr;

    const { error: doneErr } = await supabase
      .from("interviews")
      .update({ status: "completed", completed_at: new Date().toISOString(), question_count: answeredCount })
      .eq("id", interview.id);
    if (doneErr) throw doneErr;

    const { error: appDoneErr } = await supabase
      .from("applications")
      .update({ status: "interview_done" })
      .eq("id", application_id);
    if (appDoneErr) throw appDoneErr;

    return json({
      ok: true,
      phase: "complete",
      interview_id: interview.id,
      result: {
        result,
        overall_score: overall,
        strengths,
        weaknesses,
        competency_scores: competencyScores,
        summary,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
