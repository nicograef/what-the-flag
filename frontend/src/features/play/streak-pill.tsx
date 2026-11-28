import { Flame } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

/** The score with a flame; gold once the run passed its target, with a "+1" pop on each correct answer. */
export function StreakPill({
  score,
  passed,
  pop,
}: {
  score: number;
  passed: boolean;
  pop: boolean;
}): ReactNode {
  const t = useMessages(messages);

  return (
    <p
      className={cn(
        "relative flex h-10 items-center gap-1.5 rounded-full pr-3.5 pl-2.5",
        passed ? "bg-accent text-accent-ink" : "bg-surface",
      )}
    >
      <Flame
        aria-hidden="true"
        className={cn(
          "size-5",
          passed
            ? "fill-[#C2410C] text-[#C2410C]"
            : "fill-warning text-warning",
        )}
      />
      <span
        aria-hidden="true"
        className="text-[22px] font-extrabold tabular-nums"
      >
        {score}
      </span>
      <span className="sr-only">{t.streak(score)}</span>
      {pop && (
        <span
          aria-hidden="true"
          data-motion=""
          className="absolute -top-1.5 right-1 text-xl font-extrabold text-success opacity-0 motion-safe:animate-pop"
        >
          +1
        </span>
      )}
    </p>
  );
}
