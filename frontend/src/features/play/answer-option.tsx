import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { HoldFill, holdSurface, useHold } from "@/components/ui/hold-button";
import type { Item } from "@/features/play/api";
import { messages } from "@/features/play/messages";
import { ItemView } from "@/features/play/item-view";
import { useMessages } from "@/lib/i18n/messages";

/** How an option shows after the reveal; null before it. */
export type Mark = "correct" | "chosen" | "dimmed" | null;

function MarkBadge({ mark }: { mark: "correct" | "chosen" }): ReactNode {
  const Icon = mark === "correct" ? Check : X;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full ring-3 ring-background",
        mark === "correct"
          ? "bg-success text-success-ink"
          : "bg-danger text-danger-ink",
      )}
    >
      <Icon className="size-4" strokeWidth={3} />
    </span>
  );
}

/**
 * One answer. A touch or pen holds it for 400 ms; a click, Enter or Space answers at once.
 * While `armed` is false, or once answered, it is `aria-disabled` and ignores activation.
 */
export function AnswerOption({
  item,
  index,
  armed,
  answerable,
  mark,
  describedBy,
  onAnswer,
  onHoldChange,
}: {
  item: Item;
  index: number;
  armed: boolean;
  answerable: boolean;
  mark: Mark;
  describedBy: string;
  onAnswer: (option: number) => void;
  onHoldChange: (holding: boolean) => void;
}): ReactNode {
  const t = useMessages(messages);
  const ready = armed && answerable;
  const { holding, handlers } = useHold({
    ready,
    once: true,
    onCommit: () => onAnswer(index),
    onHoldChange,
  });
  const flag = item.kind === "flag";

  return (
    <button
      type="button"
      data-option=""
      aria-disabled={!ready || undefined}
      aria-describedby={describedBy}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-option border-2 border-transparent text-left text-xl leading-tight font-bold",
        "[transition:opacity_200ms,transform_100ms,box-shadow_100ms] motion-reduce:transition-none",
        holdSurface,
        flag
          ? "min-h-[124px] justify-center p-2"
          : "min-h-16 px-5 py-3 [overflow-wrap:anywhere]",
        mark === "correct"
          ? "bg-success text-success-ink shadow-[0_5px_0_var(--color-success-edge)]"
          : mark === "chosen"
            ? "bg-danger text-danger-ink shadow-[0_5px_0_var(--color-danger-edge)] motion-safe:animate-shake"
            : "bg-surface-2 shadow-[0_5px_0_rgb(0_0_0/0.28)]",
        mark === "dimmed" && "opacity-35",
        !armed && "opacity-30",
        ready && "active:translate-y-[2px]",
        holding && "ring-3 ring-accent ring-inset",
      )}
      {...handlers}
    >
      {holding && <HoldFill className="rounded-[14px] bg-accent/32" />}
      <span className="relative flex min-w-0 items-center justify-center">
        <ItemView
          item={item}
          alt={t.flagOption(index + 1)}
          width={128}
          height={96}
          className="h-24 w-32 rounded-lg object-cover ring-1 ring-black/40"
        />
      </span>
      {mark === "correct" && (
        <>
          <MarkBadge mark="correct" />
          <span className="sr-only">, {t.correctAnswer}</span>
        </>
      )}
      {mark === "chosen" && (
        <>
          <MarkBadge mark="chosen" />
          <span className="sr-only">, {t.yourAnswer}</span>
        </>
      )}
    </button>
  );
}
