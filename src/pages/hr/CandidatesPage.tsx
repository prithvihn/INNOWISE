import { useState } from "react";
import { Search, Users } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
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
import { fetchOrgCandidates } from "@/lib/api";
import type { CandidateWithApplication } from "@/lib/types";
import { APPLICATION_STATUS_LABELS } from "@/lib/status";
import { StatusBadge } from "@/components/status";

function CandidateProfile({ entry, onClose }: { entry: CandidateWithApplication; onClose: () => void }) {
  const p = entry.candidate.resume_parsed;
  return (
    <Dialog open={!!entry} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{entry.candidate.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">{entry.candidate.email}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {(p?.skills ?? []).map((s) => (
                  <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Experience</div>
              <p className="text-sm">{p?.experience || "—"}</p>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Education</div>
              <p className="text-sm">{p?.education || "—"}</p>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects</div>
              <p className="text-sm">{p?.projects?.join(", ") || "—"}</p>
            </div>
          </div>
          {entry.candidate.resume_url && (
            <Button asChild variant="outline" className="w-full">
              <a href={entry.candidate.resume_url} target="_blank" rel="noreferrer">
                Open resume
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CandidatesPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const pipeline = useData(() => (orgId ? fetchOrgCandidates(orgId) : Promise.resolve([])), [orgId]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CandidateWithApplication | null>(null);

  if (pipeline.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const entries = (pipeline.data || []).filter((e) =>
    e.candidate.full_name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has applied to your jobs, with AI screening results.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search candidates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {pipeline.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {pipeline.error}
        </p>
      )}

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No candidates yet. Applications appear here once candidates apply.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Applicants</CardTitle>
            <CardDescription>Click a candidate to view their AI-parsed profile.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-36">ATS match</TableHead>
                  <TableHead>Skill gaps</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow
                    key={e.application.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(e)}
                  >
                    <TableCell>
                      <div className="font-medium">{e.candidate.full_name}</div>
                      <div className="text-xs text-muted-foreground">{e.candidate.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{e.job.title}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={e.ats?.match_score ?? 0} className="h-1.5 w-14" />
                        <span className="text-sm font-semibold">{e.ats?.match_score ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(e.ats?.skill_gaps ?? []).slice(0, 2).map((s) => (
                          <Badge key={s} variant="outline" className="font-normal text-destructive">
                            {s}
                          </Badge>
                        ))}
                        {(e.ats?.skill_gaps ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge
                        status={e.application.status}
                        label={APPLICATION_STATUS_LABELS[e.application.status] ?? e.application.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selected && <CandidateProfile entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
