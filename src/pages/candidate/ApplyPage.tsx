import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  FileSearch,
  FileText,
  Loader2,
  Sparkles,
  Upload,
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/useAuth";
import { useData } from "@/lib/useData";
import {
  atsScreen,
  createApplication,
  fetchMyApplications,
  fetchOpenJobs,
  uploadResume,
} from "@/lib/api";
import { extractResumeText, validateResumeFile } from "@/lib/resume";
import type { JobRow } from "@/lib/types";

function ApplyDialog({
  job,
  open,
  onOpenChange,
  onDone,
}: {
  job: JobRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { candidate } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [phase, setPhase] = useState<"form" | "uploading" | "analyzing">("form");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!candidate) return;
    if (!file && pasted.trim().length < 20) {
      toast.error("Upload a resume file or paste your resume text (at least 20 characters).");
      return;
    }

    setPhase("uploading");
    try {
      let resumeUrl: string | null = null;
      let resumeText = pasted.trim();

      if (file) {
        const validationError = validateResumeFile(file);
        if (validationError) throw new Error(validationError);
        resumeText = await extractResumeText(file);
        resumeUrl = await uploadResume(file);
      }

      setPhase("analyzing");
      const app = await createApplication(candidate.id, job.id, resumeUrl, resumeText);
      toast.success("Application submitted — running AI screening now.");

      try {
        const result = await atsScreen(app.id);
        toast.success(
          `Screening complete — ${result?.match_score ?? "—"}% match with ${job.title}.`
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "AI screening failed");
      }

      onOpenChange(false);
      onDone();
      setFile(null);
      setPasted("");
      setPhase("form");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply");
      setPhase("form");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !(phase !== "form") && onOpenChange(v)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply — {job.title}</DialogTitle>
          <DialogDescription>
            Upload your resume or paste it below. INNOWISE's AI will screen it against this job.
          </DialogDescription>
        </DialogHeader>

        {phase !== "form" ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium">
              {phase === "uploading" ? "Uploading resume…" : "AI is screening your resume…"}
            </div>
            <p className="text-xs text-muted-foreground">
              {phase === "analyzing" && "Matching skills, experience and projects against the job description."}
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resume-file">Resume file (PDF or TXT)</Label>
              <label
                htmlFor="resume-file"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {file ? (
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> {file.name}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="h-4 w-4" /> Choose a file
                  </span>
                )}
              </label>
              <input
                id="resume-file"
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or paste your resume <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resume-text">Resume text</Label>
              <Textarea
                id="resume-text"
                placeholder="Paste your resume here…"
                className="min-h-[140px]"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full">
              <Sparkles className="h-4 w-4" />
              Submit application
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ApplyPage() {
  const { candidate } = useAuth();
  const jobs = useData(fetchOpenJobs, []);
  const applied = useData(
    () => (candidate ? fetchMyApplications(candidate.id) : Promise.resolve([])),
    [candidate?.id]
  );
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);

  const appliedJobIds = new Set((applied.data || []).map((a) => a.application.job_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Find jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open roles you can apply to with AI-powered screening.
        </p>
      </div>

      {jobs.loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(jobs.data || []).map((job) => {
            const alreadyApplied = appliedJobIds.has(job.id);
            return (
              <Card key={job.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{job.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {job.experience_years}+ years · {job.required_skills.length} listed skills
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {job.required_skills.slice(0, 6).map((s) => (
                      <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>
                    ))}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
                  <Button
                    className="w-full"
                    disabled={alreadyApplied}
                    onClick={() => setSelectedJob(job)}
                  >
                    {alreadyApplied ? "Applied" : "Apply now"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}

          {(jobs.data || []).length === 0 && (
            <Card className="border-dashed md:col-span-2">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <FileSearch className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No open jobs right now.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {selectedJob && (
        <ApplyDialog
          job={selectedJob}
          open={!!selectedJob}
          onOpenChange={(v) => {
            if (!v) setSelectedJob(null);
          }}
          onDone={() => applied.reload()}
        />
      )}
    </div>
  );
}
