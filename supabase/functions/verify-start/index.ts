// INNOWISE - verify-start
// Resume verification consent: the candidate opts in (or declines) to have
// their resume claims checked against public evidence sources. Records the
// consent decision, the public source handles they provide, and an audit event.
// Opt-out is always allowed and is never scored against the candidate.
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
    const { application_id, consent, github_username, linkedin_url } = await req.json();
    if (!application_id) throw new Error("application_id is required");
    if (typeof consent !== "boolean") throw new Error("consent (boolean) is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, job_id, candidate_id")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr) throw appErr;
    if (!app) throw new Error("Application not found");

    // Only the candidate who owns this application can opt in / out.
    const ownerCand = await supabase.from("candidates").select("id").eq("user_id", authData.user.id).maybeSingle();
    if (!ownerCand.data || ownerCand.data.id !== app.candidate_id) throw new Error("Unauthorized");

    // Normalize inputs (public handles only — never credentials).
    const username = String(github_username || "").trim().replace(/^@/, "");
    if (username && !/^[\w-]{1,39}$/.test(username)) throw new Error("Invalid GitHub username");
    let linkedin = String(linkedin_url || "").trim();
    if (linkedin) {
      const m = linkedin.match(/linkedin\.com\/in\/([^/?#]+)/);
      if (!m) throw new Error("Please provide a valid LinkedIn profile URL (linkedin.com/in/...)");
      linkedin = `https://www.linkedin.com/in/${m[1]}`;
    }
    const sources: string[] = [];
    if (username) sources.push("github_public");
    if (linkedin) sources.push("linkedin_self_report");

    const { data: existing } = await supabase
      .from("resume_verifications")
      .select("id")
      .eq("application_id", application_id)
      .maybeSingle();

    let verificationId = existing?.id || null;

    if (consent) {
      const payload = {
        status: "consent_given",
        opted_in: true,
        github_username: username || null,
        linkedin_url: linkedin || null,
        sources_available: sources,
        updated_at: new Date().toISOString(),
      };
      if (verificationId) {
        const { error } = await supabase.from("resume_verifications").update(payload).eq("id", verificationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("resume_verifications")
          .insert({ application_id, candidate_id: app.candidate_id, job_id: app.job_id, ...payload })
          .select("id")
          .single();
        if (error) throw error;
        verificationId = data.id;
      }
    } else {
      const payload = { status: "declined", opted_in: false, updated_at: new Date().toISOString() };
      if (verificationId) {
        const { error } = await supabase.from("resume_verifications").update(payload).eq("id", verificationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("resume_verifications")
          .insert({ application_id, candidate_id: app.candidate_id, job_id: app.job_id, ...payload })
          .select("id")
          .single();
        if (error) throw error;
        verificationId = data.id;
      }
    }

    // Audit the consent decision.
    const { error: evErr } = await supabase.from("verification_events").insert({
      verification_id: verificationId,
      application_id,
      actor_user_id: authData.user.id,
      event_type: consent ? "consent_given" : "consent_declined",
      detail: { github_username: username || null, linkedin_url: linkedin || null },
    });
    if (evErr) throw evErr;

    return json({
      ok: true,
      verification_id: verificationId,
      status: consent ? "consent_given" : "declined",
      sources_available: sources,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
