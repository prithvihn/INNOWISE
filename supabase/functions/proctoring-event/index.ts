// INNOWISE - proctoring-event
// Audit log for soft signals (devtools shortcuts, copy attempts, ignored
// debounced blurs). Never terminates — the server is the source of truth for
// violations, which are recorded by proctoring-terminate.
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
    const { token, event_type, detail } = await req.json();
    if (!token || !event_type) throw new Error("token and event_type are required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 500);

    const { data: session } = await supabase
      .from("proctoring_sessions")
      .select("id, application_id, candidate_id")
      .eq("token", token)
      .maybeSingle();

    if (session) {
      await supabase.from("proctoring_events").insert({
        session_id: session.id,
        application_id: session.application_id,
        candidate_id: session.candidate_id,
        event_type,
        detail: detail || {},
        user_agent: userAgent,
      });
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
