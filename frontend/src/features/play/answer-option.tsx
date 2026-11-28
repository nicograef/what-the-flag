import { Check, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";
import { HoldFill, holdSurface, useHold } from "@/components/ui/hold-button";
import type { Item } from "@/features/play/api";
import { ItemView } from "@/features/play/item-view";
import { messages } from "@/features/play/messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** How an option shows: revealed, or on its way to the server; null otherwise. */
export type Mark = "correct" | "chosen" | "dimmed" | "sending" | null;

function MarkIcon({
  mark,
  flag,
}: {
  mark: "correct" | "chosen";
  flag: boolean;
}): ReactNode {
  const Icon = mark === "correct" ? Check : X;
  const ink = mark === "correct" ? "text-[#0B6B47]" : "text-[#8A0A1C]";
  if (!flag) {
    return (
      <Icon
        aria-hidden="true"
        className={cn("size-6 shrink-0", ink)}
        strokeWidth={3.2}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="absolute top-2 right-2 flex size-[30px] items-center justify-center rounded-full bg-foreground"
    >
      <Icon className={cn("size-5", ink)} strokeWidth={3.2} />
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
  const { locale } = useLocale();
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
      lang={flag ? undefined : locale}
      aria-disabled={!ready || undefined}
      aria-describedby={describedBy}
      className={cn(
        "relative flex w-full items-center overflow-hidden rounded-option border-2 border-transparent text-left text-xl leading-tight font-bold",
        "[transition:opacity_200ms,transform_100ms,box-shadow_100ms] motion-reduce:transition-none",
        holdSurface,
        flag
          ? "min-h-[124px] justify-center p-2.5"
          : "min-h-16 justify-between gap-3 px-[18px] py-3 hyphens-auto [overflow-wrap:anywhere]",
        mark === "correct"
          ? "bg-success text-success-ink shadow-[0_5px_0_var(--color-success-edge)]"
          : mark === "chosen"
            ? "bg-danger text-danger-ink shadow-[0_5px_0_var(--color-danger-edge)] motion-safe:animate-shake"
            : "bg-surface-2 shadow-[0_5px_0_#1A1D40]",
        mark === "dimmed" && "opacity-35",
        mark === "sending" &&
          "bg-[#4A4A52] shadow-[0_5px_0_#1A1D40,inset_0_0_0_3px_var(--color-accent)]",
        !armed && "opacity-30",
        holding &&
          "translate-y-[3px] shadow-[0_2px_0_#1A1D40,inset_0_0_0_3px_var(--color-accent)] motion-reduce:translate-y-0",
      )}
      {...handlers}
    >
      {holding && <HoldFill up={flag} className="bg-accent/32" />}
      <span className="relative flex min-w-0 items-center">
        <ItemView
          item={item}
          alt={t.flagOption(index + 1)}
          width={128}
          height={96}
          className="h-24 w-32 rounded-md object-cover ring-1 ring-black/40"
        />
      </span>
      {mark === "correct" && (
        <>
          <MarkIcon mark="correct" flag={flag} />
          <span className="sr-only">, {t.correctAnswer}</span>
        </>
      )}
      {mark === "sending" && (
        <>
          <LoaderCircle
            aria-hidden="true"
            className="size-6 shrink-0 text-accent motion-safe:animate-spin"
            strokeWidth={3}
          />
          <span className="sr-only">, {t.sending}</span>
        </>
      )}
      {mark === "chosen" && (
        <>
          <MarkIcon mark="chosen" flag={flag} />
          <span className="sr-only">, {t.yourAnswer}</span>
        </>
      )}
    </button>
  );
}
