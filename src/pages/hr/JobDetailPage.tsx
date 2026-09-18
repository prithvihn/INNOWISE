import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  BrainCircuit,
  Loader2,
  MessagesSquare,
  Scale,
  Sparkles,
  UserCheck,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/useAuth";
import { useData } from "@/lib/useData";
import {
  fetchJobPipeline,
  hrRecommend,
  interviewStart,
  recordDecision,
  setApplicationStatus,
} from "@/lib/api";
import type { CandidateWithApplication, DecisionValue, HrRecommendation } from "@/lib/types";
import { APPLICATION_STATUS_LABELS, scoreColor } from "@/lib/status";
import { StatusBadge } from "@/components/status";

function ScoreBar({ score }: { score: number | null }) {
  const value = score ?? 0;
  return (
    <div className="flex items-center gap-2">
      <Progress value={value} className="h-1.5 w-16" />
      <span className={`text-sm font-semibold ${scoreColor(score)}`}>{score ?? "—"}</span>
    </div>
  );
}

function RecommendDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rec, setRec] = useState<HrRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      setRec(await hrRecommend(jobId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate recommendation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI candidate comparison</DialogTitle>
          <DialogDescription>
            The AI recommends based on ATS fit and interview performance — you make the final call.
          </DialogDescription>
        </DialogHeader>

        {!rec && !loading && (
          <Button onClick={run}>
            <BrainCircuit className="h-4 w-4" />
            Generate recommendation
          </Button>
        )}
        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Comparing candidates…
          </div>
        )}

        {rec && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-primary/5 p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" /> AI recommendation
              </div>
              <p className="text-sm">{rec.summary}</p>
            </div>

            <div className="space-y-2">
              {rec.ranking.map((r, i) => (
                <div
                  key={r.candidate_id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {r.name}
                        {r.candidate_id === rec.recommended_candidate_id && (
                          <Badge className="ml-2" variant="secondary">
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.rationale}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <div>ATS {r.ats_score}</div>
                    <div>Interview {r.interview_score}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DecisionDialog({
  entry,
  open,
  onOpenChange,
  onDone,
}: {
  entry: CandidateWithApplication;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [decision, setDecision] = useState<DecisionValue>("proceed");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user) return;
    setSaving(true);
    try {
      await recordDecision(entry.application.id, user.id, decision, reason, null);
      toast.success("Decision recorded.");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record decision");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record decision — {entry.candidate.full_name}</DialogTitle>
          <DialogDescription>
            You make the final decision. The AI only recommends.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: "proceed", label: "Proceed", cls: "border-success/40 text-success hover:bg-success/10" },
              { key: "hold", label: "Hold", cls: "border-warning/40 text-warning hover:bg-warning/10" },
              { key: "reject", label: "Reject", cls: "border-destructive/40 text-destructive hover:bg-destructive/10" },
            ] as { key: DecisionValue; label: string; cls: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setDecision(opt.key)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                decision === opt.key ? opt.cls + " ring-1" : "border-border text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Textarea
            id="reason"
            placeholder="Notes for the record…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRowView({
  entry,
  onInvite,
  onDecide,
}: {
  entry: CandidateWithApplication;
  onInvite: () => void;
  onDecide: () => void;
}) {
  const invited =
    entry.application.status === "interview_invited" ||
    entry.application.status === "interview_in_progress" ||
    entry.application.status === "interview_done";
  const decided = entry.application.status === "decided";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{entry.candidate.full_name}</span>
              <span className="text-xs text-muted-foreground">{entry.candidate.email}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={entry.application.status}
                label={APPLICATION_STATUS_LABELS[entry.application.status] ?? entry.application.status}
              />
              {entry.decision && (
                <Badge variant="secondary">
                  <Scale className="mr-1 h-3 w-3" /> {entry.decision.decision}
                </Badge>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {entry.candidate.resume_parsed?.experience || "Resume parsed by AI at screening time."}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground">ATS match</div>
            <ScoreBar score={entry.ats?.match_score ?? null} />
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Matched skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(entry.ats?.matched_skills ?? []).slice(0, 6).map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {s}
                </Badge>
              ))}
              {(entry.ats?.matched_skills ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">Pending screening</span>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Skill gaps
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(entry.ats?.skill_gaps ?? []).slice(0, 5).map((s) => (
                <Badge key={s} variant="outline" className="font-normal text-destructive">
                  {s}
                </Badge>
              ))}
              {(entry.ats?.skill_gaps ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">None identified</span>
              )}
            </div>
          </div>
        </div>

        {entry.ats?.evidence && (
          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <span className="mb-1 flex items-center gap-1 font-medium text-foreground">
              <Sparkles className="h-3 w-3 text-primary" /> AI screening evidence
            </span>
            {entry.ats.evidence}
          </div>
        )}

        {entry.interview && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <span className="flex items-center gap-1 font-medium">
              <UserCheck className="h-4 w-4 text-primary" /> Interview: {entry.interview.match_score}/100
            </span>
            <span className="text-xs text-muted-foreground">
              {entry.interview.ai_summary || "Evaluation complete"}
            </span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!invited && !decided && (
            <Button size="sm" onClick={onInvite}>
              <MessagesSquare className="h-4 w-4" />
              Invite to AI interview
            </Button>
          )}
          {!decided && (
            <Button size="sm" variant="outline" onClick={onDecide}>
              <Scale className="h-4 w-4" />
              Record decision
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function JobDetailPage() {
  const { jobId = "" } = useParams();
  const pipeline = useData(() => fetchJobPipeline(jobId), [jobId]);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [decisionEntry, setDecisionEntry] = useState<CandidateWithApplication | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);

  const job = pipeline.data?.[0]?.job ?? null;

  async function invite(entry: CandidateWithApplication) {
    setInviting(entry.application.id);
    try {
      await interviewStart(entry.application.id);
      await setApplicationStatus(entry.application.id, "interview_invited");
      toast.success(`AI interview created for ${entry.candidate.full_name}.`);
      pipeline.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start interview");
    } finally {
      setInviting(null);
    }
  }

  if (pipeline.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{pipeline.error || "Job not found."}</p>
        <Button asChild variant="outline">
          <Link to="/hr/jobs">
            <ArrowLeft className="h-4 w-4" /> Back to jobs
          </Link>
        </Button>
      </div>
    );
  }

  const entries = pipeline.data || [];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-3 text-muted-foreground">
        <Link to="/hr/jobs">
          <ArrowLeft className="h-4 w-4" /> Back to jobs
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
            <StatusBadge status={job.status} label={job.status === "open" ? "Open" : "Closed"} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {job.experience_years}+ years · {entries.length} applicant{entries.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => setRecommendOpen(true)}>
          <BrainCircuit className="h-4 w-4" />
          AI recommendation
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Job details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </div>
              <p className="text-sm">{job.description}</p>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Required skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {job.required_skills.map((s) => (
                  <Badge key={s} variant="secondary" className="font-normal">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            {job.responsibilities && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Responsibilities
                </div>
                <p className="text-sm">{job.responsibilities}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> AI job analysis
            </CardTitle>
            <CardDescription>Extracted from the job description by AI.</CardDescription>
          </CardHeader>
          <CardContent>
            {!job.ai_analysis ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                AI analysis pending. Re-run analysis if it did not complete.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Required skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.ai_analysis.required_skills ?? []).map((s) => (
                      <Badge key={s} className="font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Preferred skills
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.ai_analysis.preferred_skills ?? []).map((s) => (
                      <Badge key={s} variant="outline" className="font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Experience
                  </div>
                  <p className="text-sm">{job.ai_analysis.experience || "—"}</p>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Interview competencies
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(job.ai_analysis.competencies ?? []).map((c) => (
                      <Badge key={c} variant="secondary" className="font-normal">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Candidates</h2>
        {entries.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No applications yet. Candidates can apply once they see this open job.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <CandidateRowView
                key={entry.application.id}
                entry={entry}
                onInvite={() => invite(entry)}
                onDecide={() => setDecisionEntry(entry)}
              />
            ))}
          </div>
        )}
      </div>

      <RecommendDialog jobId={jobId} open={recommendOpen} onOpenChange={setRecommendOpen} />

      {decisionEntry && (
        <DecisionDialog
          entry={decisionEntry}
          open={!!decisionEntry}
          onOpenChange={(open) => {
            if (!open) setDecisionEntry(null);
          }}
          onDone={() => pipeline.reload()}
        />
      )}

      {inviting && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> Generating AI interview…
        </div>
      )}
    </div>
  );
}
