import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchVerification,
  fetchVerificationClaims,
  verifyExplain,
  verifyRun,
  verifyStart,
} from "@/lib/api";
import { useData } from "@/lib/useData";
import type { VerificationRow } from "@/lib/types";
import { VERIFICATION_STATUS_LABELS, VERDICT_LABELS, CREDIBILITY_BAND_LABELS } from "@/lib/status";
import { StatusBadge } from "@/components/status";
import { VerificationReport } from "./VerificationReport";

function bandBadgeClass(band: string | null): string {
  if (band === "high") return "border-success/40 bg-success/10 text-success";
  if (band === "medium") return "border-primary/40 bg-primary/10 text-primary";
  if (band === "low") return "border-destructive/40 bg-destructive/10 text-destructive";
  return "border-muted bg-muted/40 text-muted-foreground";
}

export function VerificationCard({ applicationId }: { applicationId: string }) {
  const verification = useData(() => fetchVerification(applicationId), [applicationId]);
  const [expanded, setExpanded] = useState(false);
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const verif: VerificationRow | null = verification.data ?? null;
  const status = verif?.status ?? "consent_needed";

  const claims = useData(
    () => (verif && status === "ready" ? fetchVerificationClaims(verif.id) : Promise.resolve([])),
    [verif?.id, status]
  );

  const requestedClaims = useMemo(
    () =>
      (claims.data ?? []).filter(
        (c) => c.explanation_status === "requested" && !c.explanation
      ),
    [claims.data]
  );
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  async function giveConsent() {
    setSaving(true);
    try {
      await verifyStart(applicationId, true, {
        github_username: github.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
      });
      toast.success("Verification consented. You can run it now.");
      verification.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save your consent");
    } finally {
      setSaving(false);
    }
  }

  async function decline() {
    setSaving(true);
    try {
      await verifyStart(applicationId, false);
      toast.success("You declined resume verification — this does not affect your application.");
      verification.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save your choice");
    } finally {
      setSaving(false);
    }
  }

  async function runVerification() {
    setRunning(true);
    try {
      await verifyRun(applicationId);
    } catch (err) {
      // The function may time out client-side while still processing; keep polling.
      const msg = err instanceof Error ? err.message : "";
      if (!/processing/i.test(msg)) {
        toast.error(msg || "Verification run started — this can take up to a minute.");
      }
    }
    // Poll until the run settles (ready or back to consent_given on failure).
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const row = await fetchVerification(applicationId).catch(() => null);
      if (row && row.status !== "analyzing") {
        verification.reload();
        setRunning(false);
        return;
      }
    }
    setRunning(false);
    verification.reload();
  }

  async function submitExplanations() {
    if (!verif) return;
    const items = requestedClaims
      .filter((c) => (explanations[c.id] ?? "").trim().length > 0)
      .map((c) => ({ claim_id: c.id, explanation: explanations[c.id].trim() }));
    if (items.length === 0) {
      toast.error("Write an explanation for at least one flagged claim first.");
      return;
    }
    setSaving(true);
    try {
      await verifyExplain(verif.id, items);
      toast.success("Explanations submitted. Recruiters will see them with your report.");
      setExplanations({});
      claims.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit explanations");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="h-4 w-4 text-primary" /> Resume verification
        </CardTitle>
        <CardDescription className="text-xs">
          Optional, consent-first check of your resume's professional claims against public sources.
          Declining is never counted against you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* --- Consent needed --- */}
        {status === "consent_needed" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We extract professional claims from your resume (experience, skills, education, projects)
              and check them against your public GitHub profile. A LinkedIn URL is optional — it is shown
              to recruiters as self-reported only. Personal contact details are never used.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gh" className="text-xs">
                  GitHub username <span className="text-muted-foreground">(public profile)</span>
                </Label>
                <Input
                  id="gh"
                  placeholder="octocat"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="li" className="text-xs">
                  LinkedIn URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="li"
                  placeholder="linkedin.com/in/username"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={giveConsent} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <ShieldCheck className="h-4 w-4" /> Consent &amp; run verification
              </Button>
              <Button variant="outline" onClick={decline} disabled={saving}>
                Decline — skip this step
              </Button>
            </div>
          </div>
        )}

        {/* --- Declined --- */}
        {status === "declined" && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                You declined resume verification. This is completely fine and has no effect on your
                application. You can change your mind at any time.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => verifyStart(applicationId, true).then(() => verification.reload())}>
              Opt back in
            </Button>
          </div>
        )}

        {/* --- Consent given (ready to run) --- */}
        {status === "consent_given" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm">Consent recorded — ready to analyze your claims.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={runVerification} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {running ? "Analyzing claims…" : "Run verification"}
              </Button>
              {verif?.github_username && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={`https://github.com/${verif.github_username}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> github.com/{verif.github_username}
                  </a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This takes up to a minute. Public GitHub data only — no private data is ever accessed.
            </p>
          </div>
        )}

        {/* --- Analyzing --- */}
        {status === "analyzing" && (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            AI is extracting claims from your resume and checking public evidence…
          </div>
        )}

        {/* --- Ready: summary + report --- */}
        {status === "ready" && verif && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status="ready" label={VERIFICATION_STATUS_LABELS.ready} />
              {verif.credibility_band && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${bandBadgeClass(verif.credibility_band)}`}
                >
                  {CREDIBILITY_BAND_LABELS[verif.credibility_band] ?? verif.credibility_band}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {verif.report?.total_claims ?? 0} claims checked
                {verif.last_run_at ? ` · ${new Date(verif.last_run_at).toLocaleDateString()}` : ""}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(verif.report?.claim_counts ?? {}).map(([v, n]) => (
                <Badge key={v} variant="outline" className="font-normal">
                  {VERDICT_LABELS[v] ?? v}: {n}
                </Badge>
              ))}
            </div>

            {requestedClaims.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-warning">
                  <ShieldCheck className="h-4 w-4" />
                  Explain flagged claims ({requestedClaims.length})
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  A few claims couldn't be fully confirmed by public sources. You can add context —
                  recruiters will see your explanation alongside the report. It's optional.
                </p>
                <div className="space-y-3">
                  {requestedClaims.map((c) => (
                    <div key={c.id} className="space-y-1.5">
                      <div className="text-sm">{c.claim_text}</div>
                      <Textarea
                        rows={2}
                        placeholder="Add context or clarification…"
                        value={explanations[c.id] ?? ""}
                        onChange={(e) => setExplanations((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <Button size="sm" className="mt-3" onClick={submitExplanations} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit explanations
                </Button>
              </div>
            )}

            <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Hide report" : "View full report"}
            </Button>
            {expanded && <VerificationReport verification={verif} claims={claims.data ?? []} />}
          </div>
        )}

        {(status === "analyzing" || status === "consent_given") && <Separator />}

        {verification.error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {verification.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
