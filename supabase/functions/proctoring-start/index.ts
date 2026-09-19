// INNOWISE - proctoring-start
// Creates (or resumes) an ACTIVE proctoring session with a server-generated token
// for an interview, and returns the server-side policy configuration.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { interview_id } = await req.json();
    if (!interview_id) throw new Error("interview_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { data: interview, error: ivErr } = await supabase
      .from("interviews")
      .select("id, application_id, status")
      .eq("id", interview_id)
      .maybeSingle();
    if (ivErr) throw ivErr;
    if (!interview) throw new Error("Interview not found");

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, job_id, candidate_id")
      .eq("id", interview.application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!app) throw new Error("Application not found");

    // Authorization: candidate owns the application, or HR of the job.
    const caller = await supabase.from("users").select("id, role, organization_id").eq("id", authData.user.id).maybeSingle();
    if (!caller.data) throw new Error("Unauthorized");
    const ownerCand = await supabase.from("candidates").select("id").eq("user_id", caller.data.id).maybeSingle();
    const isCandidate = ownerCand.data && ownerCand.data.id === app.candidate_id;
    const jobOrg = await supabase.from("jobs").select("organization_id, proctoring_enabled, proctoring_violation_policy, proctoring_warning_allowance, proctoring_grace_period_ms").eq("id", app.job_id).maybeSingle();
    if (!jobOrg.data) throw new Error("Job not found");
    const isHr = caller.data.role === "hr" && jobOrg.data.organization_id === caller.data.organization_id;
    if (!isCandidate && !isHr) throw new Error("Unauthorized");

    const policy = {
      violation_policy: jobOrg.data.proctoring_violation_policy,
      warning_allowance: jobOrg.data.proctoring_warning_allowance,
      grace_period_ms: jobOrg.data.proctoring_grace_period_ms,
    };

    if (!jobOrg.data.proctoring_enabled) {
      return json({ ok: true, enabled: false });
    }

    // Existing session: resume if ACTIVE, otherwise locked.
    const { data: existing } = await supabase
      .from("proctoring_sessions")
      .select("*")
      .eq("interview_id", interview_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      if (existing.status === "ACTIVE") {
        return json({ ok: true, enabled: true, session_id: existing.id, token: existing.token, policy });
      }
      return json({ ok: true, enabled: true, locked: true, status: existing.status });
    }

    const token = `prc_${crypto.randomUUID().replace(/-/g, "")}`;
    const { data: session, error: sErr } = await supabase
      .from("proctoring_sessions")
      .insert({
        interview_id,
        application_id: app.id,
        candidate_id: app.candidate_id,
        token,
      })
      .select()
      .single();
    if (sErr) throw sErr;

    return json({ ok: true, enabled: true, session_id: session.id, token, policy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
