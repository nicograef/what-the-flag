import type { ReactNode } from "react";
import { cn } from "cn";
import type { Entry } from "@/features/leaderboard/api";

const medals: Record<number, string> = {
  1: "bg-medal-1 text-medal-1-ink",
  2: "bg-medal-2 text-medal-2-ink",
  3: "bg-medal-3 text-medal-3-ink",
};

/** A ranked player: rank badge, name and score; the requester's own row is highlighted and current. */
export function RankRow({
  entry,
  youSuffix,
}: {
  entry: Entry;
  /** "(du)" after the own row's name. */
  youSuffix: string;
}): ReactNode {
  return (
    <li
      aria-current={entry.own ? "true" : undefined}
      className={cn(
        "flex min-h-[50px] items-center gap-3 rounded-chip px-3.5 text-[17px]",
        entry.own ? "bg-surface-2" : "bg-surface",
      )}
    >
      <span
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums",
          medals[entry.rank] ?? "text-foreground-muted",
        )}
      >
        {entry.rank}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate font-semibold">{entry.name}</span>
        {entry.own && (
          <span className="shrink-0 text-[15px] font-medium text-foreground-muted">
            {youSuffix}
          </span>
        )}
      </span>
      <span className="font-extrabold tabular-nums">{entry.score}</span>
    </li>
  );
}
