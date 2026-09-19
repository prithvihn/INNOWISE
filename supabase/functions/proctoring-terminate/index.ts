// INNOWISE - proctoring-terminate
// Server-side source of truth for integrity violations. Validates the session
// token, records the violation + audit event, flips the session to
// TERMINATED_INTEGRITY_VIOLATION, preserves + scores partial answers into an
// evaluation with outcome REJECTED, and locks the interview so no further
// answers are accepted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STALE_AFTER_SECONDS = 30;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sweep(supabase: ReturnType<typeof createClient>): Promise<void> {
  await supabase
    .from("proctoring_sessions")
    .update({
      status: "ABANDONED",
      terminated_at: new Date().toISOString(),
      violation_type: "heartbeat_timeout",
    })
    .eq("status", "ACTIVE")
    .lt("last_heartbeat_at", new Date(Date.now() - STALE_AFTER_SECONDS * 1000).toISOString());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const token = body.token as string | undefined;
    const violation_type = (body.violation_type as string) || "unknown";
    const question_index = body.question_index as number | undefined;
    const elapsed_ms = body.elapsed_ms as number | undefined;
    const detail = (body.detail || {}) as Record<string, unknown>;
    const timestamp = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();

    if (!token) throw new Error("token is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Auth: normally a user JWT is required. When the request arrives via
    // navigator.sendBeacon() (tab closing) no JWT headers exist — the
    // server-generated, unique session token IS the credential. The token is
    // validated below and every replayed token is rejected.
    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (authHeader) {
      const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
      if (authError || !authData.user) throw new Error("Unauthorized");
    }
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 500);

    await sweep(supabase);

    const { data: session, error: sErr } = await supabase
      .from("proctoring_sessions")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) throw new Error("Session not found");

    // Locked: a replayed/re-opened token must be rejected.
    if (session.status !== "ACTIVE") {
      return json({ ok: true, locked: true, status: session.status });
    }

    // Audit: the terminating violation
    await supabase.from("proctoring_events").insert({
      session_id: session.id,
      application_id: session.application_id,
      candidate_id: session.candidate_id,
      event_type: violation_type,
      detail: { ...detail, timestamp, question_index, elapsed_ms },
      user_agent: userAgent,
    });

    const terminatedAt = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("proctoring_sessions")
      .update({
        status: "TERMINATED_INTEGRITY_VIOLATION",
        terminated_at: terminatedAt,
        violation_type,
        violation_detail: { ...detail, timestamp, question_index, elapsed_ms },
        question_index: question_index ?? null,
        elapsed_ms: elapsed_ms ?? null,
      })
      .eq("id", session.id);
    if (upErr) throw upErr;

    // Preserve + score partial answers (already scored per question).
    const { data: answers } = await supabase
      .from("interview_answers")
      .select("question, answer, score, question_type")
      .eq("interview_id", session.interview_id)
      .order("created_at", { ascending: true });
    const answered = (answers || []).filter((a) => a.answer && a.score != null);
    const answeredCount = answered.length;
    const avgScore =
      answeredCount > 0
        ? Math.round((answered.reduce((sum, a) => sum + a.score, 0) / answeredCount) * 10)
        : 0;

    const reasonDetail = `${violation_type} at question ${question_index ?? "?"} after ${
      elapsed_ms != null ? Math.round(elapsed_ms / 1000) + "s" : "unknown time"
    }.`;
    const summary =
      `This interview was terminated early due to a proctoring integrity violation (${violation_type}). ` +
      `${answeredCount} partial answer(s) are preserved and scored for review, but this session is NOT a valid assessment. Reason: ${reasonDetail}`;

    await supabase.from("evaluations").insert({
      application_id: session.application_id,
      type: "interview",
      match_score: avgScore,
      evidence: reasonDetail,
      ai_summary: summary,
      raw: {
        outcome: "REJECTED",
        reason_code: "INTEGRITY_VIOLATION",
        reason_detail: reasonDetail,
        answered_questions: answeredCount,
        proctoring: { violation_type, terminated_at: terminatedAt, session_id: session.id },
      },
    });

    await supabase.from("interviews").update({ status: "terminated" }).eq("id", session.interview_id);
    await supabase
      .from("applications")
      .update({ status: "interview_terminated" })
      .eq("id", session.application_id);

    return json({
      ok: true,
      outcome: "REJECTED",
      reason_code: "INTEGRITY_VIOLATION",
      reason_detail: reasonDetail,
      answered_questions: answeredCount,
      terminated_at: terminatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
