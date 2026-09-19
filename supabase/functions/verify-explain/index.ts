// INNOWISE - verify-explain
// The candidate submits written explanations for flagged claims. Explanations
// are stored on each claim and mirrored in the verification record. They are
// reviewable by HR but never automatically change any verdict or decision.
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
    const { verification_id, explanations } = await req.json();
    if (!verification_id) throw new Error("verification_id is required");
    if (!Array.isArray(explanations) || explanations.length === 0) {
      throw new Error("explanations (array of {claim_id, explanation}) is required");
    }
    for (const e of explanations) {
      if (!e?.claim_id || typeof e.explanation !== "string" || e.explanation.trim().length === 0) {
        throw new Error("Each explanation needs a claim_id and non-empty text");
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { data: verification, error: vErr } = await supabase
      .from("resume_verifications")
      .select("id, application_id")
      .eq("id", verification_id)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!verification) throw new Error("Verification not found");

    // Only the candidate who owns this application can explain claims.
    const ownerCand = await supabase.from("candidates").select("id").eq("user_id", authData.user.id).maybeSingle();
    if (!ownerCand.data) throw new Error("Unauthorized");

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("candidate_id")
      .eq("id", verification.application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!app || app.candidate_id !== ownerCand.data.id) throw new Error("Unauthorized");

    const explanationMap: Record<string, string> = {};
    for (const e of explanations) {
      const text = e.explanation.trim().slice(0, 2000);
      const { error } = await supabase
        .from("verification_claims")
        .update({ explanation: text, explanation_status: "submitted" })
        .eq("id", e.claim_id)
        .eq("verification_id", verification_id);
      if (error) throw error;
      explanationMap[e.claim_id] = text;
    }

    const { data: current } = await supabase
      .from("resume_verifications")
      .select("candidate_explanations")
      .eq("id", verification_id)
      .maybeSingle();

    const merged = { ...(current?.candidate_explanations || {}), ...explanationMap };
    const { error: uErr } = await supabase
      .from("resume_verifications")
      .update({ candidate_explanations: merged, updated_at: new Date().toISOString() })
      .eq("id", verification_id);
    if (uErr) throw uErr;

    await supabase.from("verification_events").insert({
      verification_id,
      application_id: verification.application_id,
      actor_user_id: authData.user.id,
      event_type: "explanation_submitted",
      detail: { count: explanations.length },
    });

    return json({ ok: true, submitted: Object.keys(explanationMap).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
