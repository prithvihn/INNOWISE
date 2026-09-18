export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening…",
  screening_done: "Screened",
  interview_invited: "Interview invited",
  interview_in_progress: "Interview in progress",
  interview_done: "Interview done",
  decided: "Decided",
};

export const ATS_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Analyzing…",
  done: "Completed",
  failed: "Failed",
};

export const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  in_progress: "In progress",
  completed: "Completed",
};

export const DECISION_LABELS: Record<string, string> = {
  proceed: "Proceed",
  hold: "Hold",
  reject: "Reject",
};

export function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "decided" || status === "completed" || status === "done") return "default";
  if (status === "reject" || status === "failed") return "destructive";
  if (status === "applied" || status === "pending" || status === "invited") return "outline";
  return "secondary";
}

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

export function interviewResultLabel(result: string | null | undefined): string {
  if (!result) return "Pending";
  if (result === "pass") return "Pass";
  if (result === "no") return "Not recommended";
  return "Consider";
}
