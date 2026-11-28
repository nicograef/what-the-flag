import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { AnswerOption, type Mark } from "@/features/play/answer-option";
import type { Question } from "@/features/play/api";
import { ItemView } from "@/features/play/item-view";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

/** How long after a question renders its options ignore activation. */
export const armingMs = 400;

/** The revealed options: the correct one and the player's pick, null for no pick. */
interface Marks {
  correct: number;
  chosen: number | null;
}

export interface Status {
  text: string;
  tone: "success" | "danger";
}

function markOf(marks: Marks | null, i: number): Mark {
  if (!marks) return null;
  if (marks.correct === i) return "correct";
  if (marks.chosen === i) return "chosen";
  return "dimmed";
}

/** A question; mount it per position, so each one arms afresh. */
export function QuestionCard({
  question,
  marks,
  status,
  disabled,
  onAnswer,
  onHoldChange,
}: {
  question: Pick<Question, "type" | "prompt" | "options">;
  marks: Marks | null;
  status: Status | null;
  disabled: boolean;
  onAnswer: (option: number) => void;
  onHoldChange: (holding: boolean) => void;
}): ReactNode {
  const t = useMessages(messages);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const howId = useId();
  const [armed, setArmed] = useState(false);
  const flagOptions = question.options[0].kind === "flag";
  const StatusIcon = status?.tone === "success" ? Check : X;

  // A new question takes focus, so a screen reader reads it and Tab reaches its options.
  useEffect(() => {
    headingRef.current?.focus();
    const timer = setTimeout(() => setArmed(true), armingMs);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col gap-8 motion-safe:animate-enter">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-center text-lg leading-snug font-semibold text-balance outline-none"
        >
          {t.questions[question.type]}
        </h2>
        <div className="relative flex min-h-20 w-full shrink items-center justify-center">
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
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex translate-y-1/2 justify-center"
          >
            {status && (
              <span
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-md motion-safe:animate-pop",
                  status.tone === "success"
                    ? "bg-success text-success-ink"
                    : "bg-danger text-danger-ink",
                )}
              >
                <StatusIcon aria-hidden="true" className="size-4" />
                {status.text}
              </span>
            )}
          </p>
        </div>
      </div>
      <p id={howId} className="sr-only">
        {t.answerHow}
      </p>
      <ol
        className={cn(
          "grid gap-3",
          flagOptions ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {question.options.map((option, i) => (
          <li key={i}>
            <AnswerOption
              item={option}
              index={i}
              armed={armed}
              answerable={!disabled}
              mark={markOf(marks, i)}
              describedBy={howId}
              onAnswer={onAnswer}
              onHoldChange={onHoldChange}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
