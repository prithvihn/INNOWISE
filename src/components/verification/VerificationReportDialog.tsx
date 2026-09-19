import { useData } from "@/lib/useData";
import { fetchVerificationClaims } from "@/lib/api";
import type { VerificationRow } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { VerificationReport } from "./VerificationReport";

export function VerificationReportDialog({
  verification,
  open,
  onOpenChange,
}: {
  verification: VerificationRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const claims = useData(
    () => (open ? fetchVerificationClaims(verification.id) : Promise.resolve([])),
    [verification.id, open]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resume verification report</DialogTitle>
          <DialogDescription>
            Advisory check of the candidate's professional claims against public sources.
            Review flags and the candidate's explanations — you make the final call.
          </DialogDescription>
        </DialogHeader>
        {claims.loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <VerificationReport verification={verification} claims={claims.data ?? []} />
        )}
      </DialogContent>
    </Dialog>
  );
}
