import { Check, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";
import type { Item, Question } from "@/features/play/api";
import { messages } from "@/features/play/messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** The revealed options: the correct one and the player's pick, null for no pick. */
interface Marks {
  correct: number;
  chosen: number | null;
}

export interface Status {
  text: string;
  tone: "success" | "danger";
}

/** A flag as an image sized by `width`/`height` and `className`, any other item as its label. */
export function ItemView({
  item,
  alt,
  width,
  height,
  className,
}: {
  item: Item;
  alt: string;
  width: number;
  height: number;
  className?: string;
}): ReactNode {
  const { locale } = useLocale();
  if (item.kind === "flag") {
    return (
      <img
        src={`/flags/${item.flagKey}.svg`}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    );
  }
  return <span>{item.text[locale]}</span>;
}

function MarkBadge({ tone }: { tone: Status["tone"] }): ReactNode {
  const Icon = tone === "success" ? Check : X;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full ring-2 ring-background",
        tone === "success"
          ? "bg-success text-success-foreground"
          : "bg-destructive text-destructive-foreground",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function QuestionCard({
  question,
  marks,
  status,
  disabled,
  onAnswer,
}: {
  question: Pick<Question, "type" | "prompt" | "options">;
  marks: Marks | null;
  status: Status | null;
  disabled: boolean;
  onAnswer: (option: number) => void;
}): ReactNode {
  const t = useMessages(messages);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const flagOptions = question.options[0].kind === "flag";
  const StatusIcon = status?.tone === "success" ? Check : X;

  // A new question takes focus, so a screen reader reads it and Tab reaches its options.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 motion-safe:animate-enter">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-center text-lg leading-snug font-semibold text-balance outline-none"
      >
        {t.questions[question.type]}
      </h2>
      <div className="relative flex min-h-20 flex-1 items-center justify-center">
        {question.prompt.kind === "flag" ? (
          <ItemView
            item={question.prompt}
            alt={t.flag}
            width={240}
            height={180}
            className="h-full max-h-44 w-auto max-w-full rounded-lg object-contain shadow-sm ring-1 ring-foreground/10"
          />
        ) : (
          <p className="text-center text-3xl font-bold text-balance">
            <ItemView
              item={question.prompt}
              alt={t.flag}
              width={240}
              height={180}
            />
          </p>
        )}
        <p
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1/2 justify-center"
        >
          {status && (
            <span
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-md motion-safe:animate-pop",
                status.tone === "success"
                  ? "bg-success text-success-foreground"
                  : "bg-destructive text-destructive-foreground",
              )}
            >
              <StatusIcon aria-hidden="true" className="size-4" />
              {status.text}
            </span>
          )}
        </p>
      </div>
      <ol
        className={cn(
          "grid gap-2",
          flagOptions ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {question.options.map((option, i) => {
          const correct = marks?.correct === i;
          const chosenWrong = !correct && marks?.chosen === i;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAnswer(i)}
                className={cn(
                  "relative flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 text-base font-semibold shadow-xs select-none",
                  "transition-[transform,background-color,border-color,opacity] duration-150 motion-reduce:transition-none",
                  "enabled:hover:bg-muted enabled:active:bg-muted motion-safe:active:scale-[0.98]",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:cursor-default",
                  flagOptions ? "h-24 p-2" : "min-h-13",
                  correct && "border-success bg-success/10",
                  chosenWrong &&
                    "border-destructive bg-destructive/10 motion-safe:animate-shake",
                  marks && !correct && !chosenWrong && "opacity-50",
                )}
              >
                <ItemView
                  item={option}
                  alt={t.flagOption(i + 1)}
                  width={160}
                  height={120}
                  className="max-h-full max-w-full rounded-sm object-contain ring-1 ring-foreground/10"
                />
                {correct && (
                  <>
                    <MarkBadge tone="success" />
                    <span className="sr-only">, {t.correctAnswer}</span>
                  </>
                )}
                {chosenWrong && (
                  <>
                    <MarkBadge tone="danger" />
                    <span className="sr-only">, {t.yourAnswer}</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
