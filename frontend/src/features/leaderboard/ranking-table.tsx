import type { ReactNode } from "react";
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

/** A ranked list; the requester's own row is highlighted and marked as current. */
export function RankingTable({
  entries,
  caption,
}: {
  entries: Entry[];
  caption: string;
}): ReactNode {
  const t = useMessages(messages);

  if (entries.length === 0) {
    return <p className="text-muted-foreground">{t.empty}</p>;
  }

  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 text-right">{t.rank}</TableHead>
          <TableHead>{t.name}</TableHead>
          <TableHead className="w-20 text-right">{t.score}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e, i) => (
          <TableRow
            // Names repeat and ranks tie; the position is the row's identity.
            key={i}
            aria-current={e.own ? "true" : undefined}
            className={e.own ? "bg-primary/10 font-semibold" : undefined}
          >
            <TableCell className="text-right tabular-nums">{e.rank}</TableCell>
            <TableCell className="max-w-0 truncate">
              {e.name}
              {e.own && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({t.you})
                </span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{e.score}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
