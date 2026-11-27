import { Check, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Item, Question } from "@/features/play/api";
import { messages } from "@/features/play/messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** The revealed options: the correct one and the player's pick, null for no pick. */
interface Marks {
  correct: number;
  chosen: number | null;
}

function flagSrc(flagKey: string): string {
  return `/flags/${flagKey}.svg`;
}

function ItemView({ item, alt }: { item: Item; alt: string }): ReactNode {
  const { locale } = useLocale();
  if (item.kind === "flag") {
    return (
      <img
        src={flagSrc(item.flagKey)}
        alt={alt}
        className="h-full max-h-28 w-auto rounded-sm ring-1 ring-foreground/10"
      />
    );
  }
  return <span>{item.text[locale]}</span>;
}

export function QuestionCard({
  question,
  heading,
  marks,
  disabled = false,
  onAnswer,
}: {
  question: Pick<Question, "type" | "prompt" | "options">;
  heading: string;
  marks?: Marks | null;
  disabled?: boolean;
  /** Without it the options are a read-only list, as in the result. */
  onAnswer?: (option: number) => void;
}): ReactNode {
  const t = useMessages(messages);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const flagOptions = question.options[0].kind === "flag";
  const interactive = onAnswer !== undefined;

  // A new question takes focus, so a screen reader reads it and Tab reaches its options.
  useEffect(() => {
    if (interactive) headingRef.current?.focus();
  }, [interactive]);

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {heading}
        </p>
        <h2
          ref={headingRef}
          tabIndex={interactive ? -1 : undefined}
          className="font-heading text-lg leading-snug font-medium outline-none"
        >
          {t.questions[question.type]}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <div className="flex h-32 items-center justify-center text-center font-heading text-3xl font-semibold">
          <ItemView item={question.prompt} alt={t.flag} />
        </div>
        <ol
          className={cn(
            "grid w-full gap-3",
            flagOptions ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
          )}
        >
          {question.options.map((option, i) => {
            const correct = marks?.correct === i;
            const chosenWrong = !correct && marks?.chosen === i;
            const className = cn(
              "flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border bg-background p-3 text-base font-medium transition-colors duration-150",
              flagOptions && "h-24",
              correct && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950",
              chosenWrong && "border-destructive bg-destructive/10",
            );
            const content = (
              <>
                <ItemView item={option} alt={t.flagOption(i + 1)} />
                {correct && (
                  <>
                    <Check aria-hidden="true" className="text-emerald-600" />
                    <span className="sr-only">, {t.correctAnswer}</span>
                  </>
                )}
                {chosenWrong && (
                  <>
                    <X aria-hidden="true" className="text-destructive" />
                    <span className="sr-only">, {t.yourAnswer}</span>
                  </>
                )}
              </>
            );
            return (
              <li key={i}>
                {onAnswer ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onAnswer(i)}
                    className={cn(
                      className,
                      "cursor-pointer outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:hover:bg-background",
                    )}
                  >
                    {content}
                  </button>
                ) : (
                  <div className={className}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
