import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Briefcase, Loader2, Plus, Sparkles } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/useAuth";
import { useData } from "@/lib/useData";
import { analyzeJob, createJob, fetchJobsForOrg } from "@/lib/api";
import { StatusBadge } from "@/components/status";

function CreateJobDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { organization } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("3");
  const [responsibilities, setResponsibilities] = useState("");
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setSaving(true);
    try {
      const job = await createJob({
        organization_id: organization.id,
        title: title.trim(),
        description: description.trim(),
        required_skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        experience_years: Math.max(0, parseInt(experience, 10) || 0),
        responsibilities: responsibilities.trim(),
      });

      onOpenChange(false);
      onCreated();
      toast.success(`Job "${job.title}" created — analyzing it with AI now…`);

      setAnalyzing(true);
      try {
        await analyzeJob(job.id);
        toast.success("AI job analysis complete.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI analysis failed");
      } finally {
        setAnalyzing(false);
        onCreated();
      }

      setTitle("");
      setDescription("");
      setSkills("");
      setExperience("3");
      setResponsibilities("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create a job</DialogTitle>
          <DialogDescription>
            INNOWISE will use AI to analyze the job description and extract required skills and interview
            competencies.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-title">Job title</Label>
            <Input
              id="job-title"
              placeholder="e.g. Senior Backend Developer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-desc">Job description</Label>
            <Textarea
              id="job-desc"
              placeholder="Describe the role, responsibilities and what success looks like…"
              className="min-h-[120px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-skills">Required skills</Label>
            <Input
              id="job-skills"
              placeholder="Node.js, PostgreSQL, Redis, TypeScript, Docker"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma-separated list.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="job-exp">Years of experience</Label>
              <Input
                id="job-exp"
                type="number"
                min={0}
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-resp">Responsibilities</Label>
            <Textarea
              id="job-resp"
              placeholder="Lead the design of new APIs, own database performance, mentor engineers…"
              className="min-h-[80px]"
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving || analyzing}>
            {(saving || analyzing) && <Loader2 className="h-4 w-4 animate-spin" />}
            <Sparkles className="h-4 w-4" />
            {saving ? "Creating…" : analyzing ? "Analyzing…" : "Create & run AI analysis"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function JobsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const jobs = useData(() => (orgId ? fetchJobsForOrg(orgId) : Promise.resolve([])), [orgId]);
  const [createOpen, setCreateOpen] = useState(false);

  if (jobs.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Post a role and let AI analyze it for hiring-ready screening.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create job
        </Button>
      </div>

      {jobs.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {jobs.error}
        </p>
      )}

      {(jobs.data || []).length === 0 && !jobs.error ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">No jobs yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first job posting to begin hiring with AI screening.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(jobs.data || []).map((job) => (
            <Link key={job.id} to={`/hr/jobs/${job.id}`} className="group">
              <Card className="card-hover h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base group-hover:text-primary">
                        {job.title}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {job.experience_years}+ years · created{" "}
                        {new Date(job.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <StatusBadge status={job.status} label={job.status === "open" ? "Open" : "Closed"} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {job.ai_analysis ? (
                    <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI analysis ready · {job.ai_analysis.competencies?.length ?? 0} competencies mapped
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Waiting for AI analysis
                    </div>
                  )}
                  <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateJobDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => jobs.reload()}
      />
    </div>
  );
}
