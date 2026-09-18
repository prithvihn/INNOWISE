import { Link } from "react-router-dom";
import {
  BadgeCheck,
  FileText,
  Loader2,
  MessagesSquare,
  Scale,
  Sparkles,
  TrendingUp,
  UserRound,
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/useAuth";
import { useData } from "@/lib/useData";
import { fetchMyApplications } from "@/lib/api";
import {
  APPLICATION_STATUS_LABELS,
  ATS_STATUS_LABELS,
  DECISION_LABELS,
  INTERVIEW_STATUS_LABELS,
  interviewResultLabel,
  scoreColor,
} from "@/lib/status";
import { StatusBadge } from "@/components/status";

export default function CandidateDashboardPage() {
  const { candidate, profile } = useAuth();
  const applications = useData(
    () => (candidate ? fetchMyApplications(candidate.id) : Promise.resolve([])),
    [candidate?.id]
  );

  if (applications.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const entries = applications.data || [];
  const parsed = candidate?.resume_parsed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your applications, AI screening results and interviews.
        </p>
      </div>

      {applications.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {applications.error}
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="h-4 w-4 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(parsed?.skills ?? []).map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>
              ))}
              {(parsed?.skills ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">Upload a resume to have it parsed.</span>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Experience
            </div>
            <p className="text-sm">{parsed?.experience || "—"}</p>
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Education
              </div>
              <p className="text-sm">{parsed?.education || "—"}</p>
            </div>
          </div>
          {(parsed?.projects ?? []).length > 0 && (
            <div className="sm:col-span-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Projects
              </div>
              <p className="text-sm">{parsed?.projects?.join(" · ")}</p>
            </div>
          )}
          {!candidate?.resume_url && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
              <FileText className="h-4 w-4" />
              No resume uploaded yet — you can attach one when applying.
            </div>
          )}
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No applications yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse open jobs and apply with your resume to get started.
              </p>
            </div>
            <Button asChild>
              <Link to="/candidate/apply">Find jobs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((e) => (
            <ApplicationCard key={e.application.id} applicationId={e.application.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationCard({ applicationId }: { applicationId: string }) {
  const { candidate } = useAuth();
  const detail = useData(
    () =>
      candidate
        ? fetchMyApplications(candidate.id).then((rows) => rows.find((r) => r.application.id === applicationId))
        : Promise.resolve(undefined),
    [candidate?.id, applicationId]
  );

  if (detail.loading || !detail.data) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-24" />
        </CardContent>
      </Card>
    );
  }

  const e = detail.data;
  const { application, job, ats, interview, interview_row, decision } = e;
  const interviewInvited =
    application.status === "interview_invited" ||
    application.status === "interview_in_progress" ||
    application.status === "interview_done";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{job.title}</CardTitle>
            <CardDescription className="mt-1">
              Applied {new Date(application.created_at).toLocaleDateString()}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={application.status}
              label={APPLICATION_STATUS_LABELS[application.status] ?? application.status}
            />
            {decision && (
              <StatusBadge status={decision.decision} label={DECISION_LABELS[decision.decision]} />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ATS screening */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> ATS screening
          </span>
          <StatusBadge
            status={application.ats_status}
            label={ATS_STATUS_LABELS[application.ats_status] ?? application.ats_status}
          />
          {ats?.match_score != null && (
            <div className="ml-auto flex items-center gap-2">
              <Progress value={ats.match_score} className="h-1.5 w-24" />
              <span className={`text-sm font-bold ${scoreColor(ats.match_score)}`}>
                {ats.match_score}% match
              </span>
            </div>
          )}
        </div>

        {ats && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Matched skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(ats.matched_skills ?? []).map((s) => (
                  <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <TrendingUp className="h-3 w-3" /> Recommended skills to improve
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(ats.skill_gaps ?? []).map((s) => (
                  <Badge key={s} variant="outline" className="font-normal text-warning">{s}</Badge>
                ))}
                {(ats.skill_gaps ?? []).length === 0 && (
                  <span className="text-xs text-muted-foreground">No gaps identified</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Interview */}
        {interviewInvited && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">AI interview</span>
                {interview_row && (
                  <StatusBadge
                    status={interview_row.status}
                    label={INTERVIEW_STATUS_LABELS[interview_row.status] ?? interview_row.status}
                  />
                )}
              </div>

              {interview_row?.status === "in_progress" && (
                <Button size="sm" asChild>
                  <Link to={`/candidate/interview?application=${application.id}`}>Continue interview</Link>
                </Button>
              )}
              {interview_row?.status === "invited" && (
                <Button size="sm" asChild>
                  <Link to={`/candidate/interview?application=${application.id}`}>Start interview</Link>
                </Button>
              )}
            </div>

            {interview && interview_row?.status === "completed" && (
              <div className="mt-3 grid gap-3 border-t border-primary/10 pt-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Result
                  </div>
                  <div className="flex items-center gap-2">
                    <BadgeCheck className="h-4 w-4 text-success" />
                    <span className="text-sm font-semibold">
                      {interviewResultLabel(interview.raw?.result as string)} · {interview.match_score}/100
                    </span>
                  </div>
                  {interview.ai_summary && (
                    <p className="mt-1 text-xs text-muted-foreground">{interview.ai_summary}</p>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Key strengths
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(interview.strengths ?? []).map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>
                    ))}
                  </div>
                </div>
                {(interview.weaknesses ?? []).length > 0 && (
                  <div className="sm:col-span-2">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Areas to improve
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(interview.weaknesses ?? []).map((s) => (
                        <Badge key={s} variant="outline" className="font-normal text-warning">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Decision */}
        {decision && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-sm">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <span className="font-medium">
                Final decision: {DECISION_LABELS[decision.decision]}
              </span>
              {decision.reason && <p className="mt-1 text-muted-foreground">{decision.reason}</p>}
            </div>
          </div>
        )}

        {application.ats_status === "processing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> AI is screening your resume…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
