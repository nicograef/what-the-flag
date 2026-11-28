import type { ReactNode } from "react";
import { cn } from "cn";
import { gapCount, type GapTarget } from "@/features/play/gap";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

/** The line under the streak pill: the questions to the target, the tie, then the target beaten. */
export function GapPill({
  target,
  score,
}: {
  target: GapTarget;
  score: number;
}): ReactNode {
  const t = useMessages(messages);
  const n = gapCount(target, score);
  let text: string;
  if (target.kind === "record") {
    text = n > 1 ? t.recordIn(n) : n === 1 ? t.recordTied : t.recordNew;
  } else {
    text =
      n > 1
        ? t.creatorIn(target.name, n)
        : n === 1
          ? t.creatorTied(target.name)
          : t.creatorBeaten(target.name);
  }

  return (
    <p
      className={cn(
        "text-[13px] font-bold",
        n <= 0 ? "text-accent" : "text-foreground-muted",
      )}
    >
      {text}
    </p>
  );
}
