import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/context/useAuth";
import { useData } from "@/lib/useData";
import { fetchOrgInterviews } from "@/lib/api";
import { INTERVIEW_STATUS_LABELS, scoreColor } from "@/lib/status";
import { StatusBadge } from "@/components/status";

interface InterviewEntry {
  interview: { id: string; status: string; question_count: number; created_at: string };
  application: { id: string };
  candidate: { full_name: string; email: string };
  job: { title: string };
  answers: {
    id: string;
    question: string;
    question_type: string;
    answer: string | null;
    score: number | null;
    feedback: string | null;
  }[];
}

function InterviewView({ entry, onClose }: { entry: InterviewEntry; onClose: () => void }) {
  return (
    <Dialog open={!!entry} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry.candidate.full_name} — {entry.job.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {entry.answers.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No questions yet.</p>
          )}
          {entry.answers.map((a, i) => (
            <div key={a.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">Q{i + 1}. {a.question}</div>
                {a.score && (
                  <span className={`shrink-0 text-sm font-bold ${scoreColor(a.score * 10)}`}>
                    {a.score}/10
                  </span>
                )}
              </div>
              <Badge variant="outline" className="mt-1.5 font-normal">
                {a.question_type}
              </Badge>
              {a.answer && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.answer}</p>
              )}
              {a.feedback && (
                <div className="mt-3 rounded-md bg-primary/5 p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">AI feedback: </span>
                  {a.feedback}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function InterviewsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const interviews = useData(
    () => (orgId ? fetchOrgInterviews(orgId) : Promise.resolve([])),
    [orgId]
  );
  const [selected, setSelected] = useState<InterviewEntry | null>(null);

  if (interviews.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const list = (interviews.data || []) as InterviewEntry[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Interviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI interviews across your jobs. Click a row to review the transcript.
        </p>
      </div>

      {interviews.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {interviews.error}
        </p>
      )}

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <MessagesSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No interviews yet. Invite a screened candidate from the job page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Interview sessions</CardTitle>
            <CardDescription>
              {list.filter((i) => i.interview.status === "completed").length} completed ·{" "}
              {list.filter((i) => i.interview.status === "in_progress").length} in progress
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((e) => (
                  <TableRow
                    key={e.interview.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <TableCell>
                      <div className="font-medium">{e.candidate.full_name}</div>
                      <div className="text-xs text-muted-foreground">{e.candidate.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{e.job.title}</TableCell>
                    <TableCell className="text-sm">{e.interview.question_count}</TableCell>
                    <TableCell className="text-right">
                      <StatusBadge
                        status={e.interview.status}
                        label={INTERVIEW_STATUS_LABELS[e.interview.status] ?? e.interview.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Separator />

      {selected && <InterviewView entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
