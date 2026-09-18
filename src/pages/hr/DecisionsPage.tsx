import { Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { fetchOrgDecisions } from "@/lib/api";
import { DECISION_LABELS } from "@/lib/status";
import { StatusBadge } from "@/components/status";

export default function DecisionsPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const decisions = useData(
    () => (orgId ? fetchOrgDecisions(orgId) : Promise.resolve([])),
    [orgId]
  );

  if (decisions.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const list = decisions.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Decisions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Final hiring decisions recorded by HR. AI only recommends — you decide.
        </p>
      </div>

      {decisions.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {decisions.error}
        </p>
      )}

      {list.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Scale className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No decisions yet. Record your decision from a job's candidate list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Recorded decisions</CardTitle>
            <CardDescription>Each decision is stored permanently in the database.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-28">ATS match</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(({ decision, candidate, job }) => (
                  <TableRow key={decision.id}>
                    <TableCell>
                      <div className="font-medium">{candidate.full_name}</div>
                      <div className="text-xs text-muted-foreground">{candidate.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{job.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">—</TableCell>
                    <TableCell>
                      <StatusBadge status={decision.decision} label={DECISION_LABELS[decision.decision]} />
                    </TableCell>
                    <TableCell className="max-w-xs text-sm text-muted-foreground">
                      {decision.reason || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 text-sm">
          <Badge variant="secondary" className="mb-2">Good to know</Badge>
          <p className="text-muted-foreground">
            Candidates see their final decision status reflected on their own dashboard after you record it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
