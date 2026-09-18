import { Link } from "react-router-dom";
import type { ElementType } from "react";
import {
  ArrowRight,
  Briefcase,
  Loader2,
  MessagesSquare,
  Scale,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/useAuth";
import { useData } from "@/lib/useData";
import { fetchJobsForOrg, fetchOrgCandidates, fetchOrgDecisions, fetchOrgInterviews } from "@/lib/api";
import { APPLICATION_STATUS_LABELS, scoreColor } from "@/lib/status";
import { StatusBadge } from "@/components/status";

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;

  const jobs = useData(() => (orgId ? fetchJobsForOrg(orgId) : Promise.resolve([])), [orgId]);
  const pipeline = useData(() => (orgId ? fetchOrgCandidates(orgId) : Promise.resolve([])), [orgId]);
  const interviews = useData(() => (orgId ? fetchOrgInterviews(orgId) : Promise.resolve([])), [orgId]);
  const decisions = useData(() => (orgId ? fetchOrgDecisions(orgId) : Promise.resolve([])), [orgId]);

  if (jobs.loading || pipeline.loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const jobList = jobs.data || [];
  const entries = pipeline.data || [];
  const interviewList = interviews.data || [];
  const decisionList = decisions.data || [];

  const openJobs = jobList.filter((j) => j.status === "open").length;
  const uniqueCandidates = new Set(entries.map((e) => e.candidate.id)).size;
  const withAts = entries.filter((e) => e.ats?.match_score != null);
  const avgMatch =
    withAts.length > 0
      ? Math.round(withAts.reduce((sum, e) => sum + (e.ats?.match_score ?? 0), 0) / withAts.length)
      : null;
  const inProgressInterviews = interviewList.filter((i) => i.interview.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome back — here is what is happening across your hiring pipeline.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Briefcase} label="Open jobs" value={openJobs} hint={`${jobList.length} total`} />
        <StatCard icon={Users} label="Candidates" value={uniqueCandidates} hint="across all jobs" />
        <StatCard
          icon={Scale}
          label="Avg. ATS match"
          value={avgMatch === null ? "—" : `${avgMatch}%`}
          hint="of screened candidates"
        />
        <StatCard
          icon={MessagesSquare}
          label="Active interviews"
          value={inProgressInterviews}
          hint={`${decisionList.length} decisions made`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent jobs</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to="/hr/jobs">
                All jobs <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobList.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No jobs yet. Create your first job to start hiring.
              </p>
            )}
            {jobList.slice(0, 5).map((job) => {
              const applicants = entries.filter((e) => e.application.job_id === job.id).length;
              return (
                <Link
                  key={job.id}
                  to={`/hr/jobs/${job.id}`}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{job.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {applicants} applicant{applicants === 1 ? "" : "s"}
                    </div>
                  </div>
                  <StatusBadge status={job.status} label={job.status === "open" ? "Open" : "Closed"} />
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entries.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Candidates who apply will appear here.
              </p>
            )}
            {entries.slice(0, 6).map((e) => (
              <div key={e.application.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.candidate.full_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{e.job.title}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`text-sm font-semibold ${scoreColor(e.ats?.match_score ?? null)}`}>
                    {e.ats?.match_score ?? "—"}
                  </span>
                  <StatusBadge
                    status={e.application.status}
                    label={APPLICATION_STATUS_LABELS[e.application.status] ?? e.application.status}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {errorBanner(jobs.error || pipeline.error || interviews.error || decisions.error)}
    </div>
  );
}

function errorBanner(error: string | null) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <Loader2 className="h-4 w-4" />
      {error}
    </div>
  );
}
