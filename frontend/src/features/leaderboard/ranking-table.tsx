import { Trophy } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Entry } from "@/features/leaderboard/api";
import { messages } from "@/features/leaderboard/messages";
import { useMessages } from "@/lib/i18n/messages";

/** Fixed light fills with dark text, so the medals read the same in both themes. */
function medal(rank: number): string {
  switch (rank) {
    case 1:
      return "bg-amber-300 text-amber-950";
    case 2:
      return "bg-slate-300 text-slate-900";
    case 3:
      return "bg-orange-300 text-orange-950";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** A ranked list; the requester's own row is highlighted and marked as current. */
export function RankingTable({
  entries,
  caption,
}: {
  entries: Entry[];
  caption: string;
}): ReactNode {
  const t = useMessages(messages);
  const ownRow = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    ownRow.current?.scrollIntoView?.({ block: "center" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <EmptyState icon={<Trophy />}>
        <p className="text-muted-foreground">{t.empty}</p>
      </EmptyState>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 text-center">{t.rank}</TableHead>
            <TableHead>{t.name}</TableHead>
            <TableHead className="w-16 text-right">{t.score}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e, i) => (
            <TableRow
              // Names repeat and ranks tie; the position is the row's identity.
              key={i}
              ref={e.own ? ownRow : undefined}
              aria-current={e.own ? "true" : undefined}
              className={e.own ? "bg-primary/10" : undefined}
            >
              <TableCell className="text-center">
                <span
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-full text-sm font-bold tabular-nums",
                    medal(e.rank),
                  )}
                >
                  {e.rank}
                </span>
              </TableCell>
              <TableCell className="max-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{e.name}</span>
                  {e.own && (
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      ({t.you})
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-base font-bold tabular-nums">
                {e.score}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
