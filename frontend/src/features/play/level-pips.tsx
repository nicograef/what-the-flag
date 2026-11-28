import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Five pips for the position inside the current block of five: done, current, open.
 * `missed` draws the current pip as a cross; `answered` counts it as done.
 */
export function LevelPips({
  position,
  answered,
  missed,
}: {
  position: number;
  answered: boolean;
  missed: boolean;
}): ReactNode {
  const current = position % 5;

  return (
    <div aria-hidden="true" className="flex w-[180px] gap-1">
      {[0, 1, 2, 3, 4].map((i) => {
        if (i === current && missed) {
          return (
            <span
              key={i}
              data-pip="miss"
              className="flex h-2 flex-1 items-center justify-center"
            >
              <X className="size-4 text-danger" strokeWidth={4} />
            </span>
          );
        }
        const state =
          i < current || (i === current && answered)
            ? "done"
            : i === current
              ? "current"
              : "open";
        return (
          <span
            key={i}
            data-pip={state}
            className={cn(
              "h-2 flex-1 rounded",
              state === "done" && "bg-accent",
              state === "current" && "bg-accent/45",
              state === "open" && "border-2 border-border-strong",
            )}
          />
        );
      })}
    </div>
  );
}
