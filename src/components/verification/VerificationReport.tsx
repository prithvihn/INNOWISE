import { AlertTriangle, CheckCircle2, FileSearch, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { RecruiterBrief, VerificationClaimRow, VerificationRow } from "@/lib/types";
import { CREDIBILITY_BAND_LABELS, VERDICT_LABELS } from "@/lib/status";
import { cn } from "@/lib/utils";

const VERDICT_STYLES: Record<string, string> = {
  VERIFIED: "border-success/40 bg-success/10 text-success",
  PARTIALLY_VERIFIED: "border-primary/40 bg-primary/10 text-primary",
  UNVERIFIED: "border-warning/40 bg-warning/10 text-warning",
  CONTRADICTED: "border-destructive/40 bg-destructive/10 text-destructive",
  UNVERIFIABLE: "border-muted bg-muted/40 text-muted-foreground",
};

function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        VERDICT_STYLES[verdict] ?? VERDICT_STYLES.UNVERIFIABLE
      )}
    >
      {VERDICT_LABELS[verdict] ?? verdict}
    </span>
  );
}

function BandBadge({ band }: { band: string }) {
  const style =
    band === "high"
      ? "border-success/40 bg-success/10 text-success"
      : band === "medium"
        ? "border-primary/40 bg-primary/10 text-primary"
        : band === "low"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-muted bg-muted/40 text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", style)}>
      {CREDIBILITY_BAND_LABELS[band] ?? band}
    </span>
  );
}

export function VerificationReport({
  verification,
  claims,
}: {
  verification: VerificationRow;
  claims: VerificationClaimRow[];
}) {
  const brief: RecruiterBrief | null = verification.recruiter_brief;
  const counts = verification.report?.claim_counts ?? {};
  const rateLimited = verification.report?.rate_limited;
  const sources = verification.report?.sources_used ?? [];

  return (
    <div className="space-y-4">
      {/* Band + coverage */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FileSearch className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Credibility assessment</span>
            {verification.credibility_band && <BandBadge band={verification.credibility_band} />}
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {Object.entries(counts).map(([v, n]) => (
              <Badge key={v} variant="outline" className="font-normal">
                {VERDICT_LABELS[v] ?? v}: {n}
              </Badge>
            ))}
          </div>
          {sources.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Evidence sources: public GitHub data
              {verification.report?.linkedin_self_reported ? " + self-reported LinkedIn (not counted as evidence)" : ""}.
            </p>
          )}
          {rateLimited && (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              GitHub's public API rate limit was hit during collection, so the evidence is partial. A re-run may capture more.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recruiter brief */}
      {brief && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="h-4 w-4 text-primary" /> Recruiter brief
            </CardTitle>
            <CardDescription className="text-xs">
              Advisory only — the final decision is always the recruiter's.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {brief.summary && <p>{brief.summary}</p>}
            {brief.coverage && (
              <p className="text-xs text-muted-foreground">Coverage: {brief.coverage}</p>
            )}
            {brief.strengths.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What the evidence supports
                </div>
                <ul className="space-y-1">
                  {brief.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span className="text-sm">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {brief.flags.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-warning">
                  <AlertTriangle className="h-3 w-3" /> Claims to review
                </div>
                <div className="space-y-2">
                  {brief.flags.map((f, i) => (
                    <div key={i} className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                      <div className="text-sm font-medium">{f.claim}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{f.issue}</p>
                      {f.sources.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Sources: {f.sources.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {brief.interview_suggestions.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Suggested interview questions
                </div>
                <ul className="list-inside list-disc space-y-1">
                  {brief.interview_suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-muted-foreground">{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Claims */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Claims ({claims.length})</CardTitle>
          <CardDescription className="text-xs">
            Professional claims extracted from the resume, checked against the public evidence available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {claims.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No claims recorded.</p>
          )}
          {claims.map((claim) => (
            <div key={claim.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{claim.claim_text}</span>
                    <Badge variant="secondary" className="font-normal normal-case">{claim.claim_type}</Badge>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <VerdictBadge verdict={claim.verdict} />
                  <span className="text-[11px] text-muted-foreground capitalize">{claim.confidence}</span>
                </div>
              </div>
              {claim.rationale && <p className="mt-2 text-xs text-muted-foreground">{claim.rationale}</p>}
              {claim.evidence && claim.evidence.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {claim.evidence.map((e, i) => (
                    <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {e.source}
                    </span>
                  ))}
                </div>
              )}
              {claim.explanation && (
                <div className="mt-2 rounded-md bg-muted/60 p-2 text-xs">
                  <span className="font-medium text-foreground">Candidate explanation: </span>
                  <span className="text-muted-foreground">{claim.explanation}</span>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground">
        Verification is an advisory check of professional claims against public sources. A claim that
        could not be verified is not proof it is false, and this report never makes the hiring decision.
      </p>
    </div>
  );
}
