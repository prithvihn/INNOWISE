// INNOWISE - proctoring-heartbeat
// Client pings every ~10s with the session token. Also runs the background
// sweep: ACTIVE sessions with no heartbeat for 30s are marked ABANDONED
// (catches hard closes, crashes, killed network).
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
    const { token } = await req.json();
    if (!token) throw new Error("token is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const authHeader = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !authData.user) throw new Error("Unauthorized");

    await sweep(supabase);

    const { data: session, error: sErr } = await supabase
      .from("proctoring_sessions")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) throw new Error("Session not found");

    if (session.status !== "ACTIVE") {
      return json({ ok: true, locked: true, status: session.status });
    }

    const { error: upErr } = await supabase
      .from("proctoring_sessions")
      .update({ last_heartbeat_at: new Date().toISOString(), heartbeat_count: (session.heartbeat_count || 0) + 1 })
      .eq("id", session.id);
    if (upErr) throw upErr;

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: message }, 400);
  }
});
