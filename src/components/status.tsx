import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusVariant } from "@/lib/status";

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant={statusVariant(status)} className={cn("whitespace-nowrap", className)}>
      {label}
    </Badge>
  );
}
