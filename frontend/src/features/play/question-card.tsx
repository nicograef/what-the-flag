import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { AnswerOption, type Mark } from "@/features/play/answer-option";
import type { Question } from "@/features/play/api";
import { ItemView } from "@/features/play/item-view";
import { messages } from "@/features/play/messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** How long after a question renders its options ignore activation. */
export const armingMs = 400;

/** The revealed options: the correct one and the player's pick, null for no pick. */
export interface Marks {
  correct: number;
  chosen: number | null;
}

function markOf(marks: Marks | null, i: number): Mark {
  if (!marks) return null;
  if (marks.correct === i) return "correct";
  if (marks.chosen === i) return "chosen";
  return "dimmed";
}

/** 46 px for a short word, 1 px less per letter beyond 8, down to 28 px; longer words wrap. */
function promptSize(text: string): number {
  return Math.max(28, Math.min(46, 46 - (text.length - 8) * 1.5));
}

function Prompt({
  question,
}: {
  question: Pick<Question, "prompt">;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const { prompt } = question;
  if (prompt.kind === "flag") {
    return (
      <ItemView
        item={prompt}
        alt={t.flag}
        width={232}
        height={174}
        className="aspect-4/3 h-auto max-h-[174px] w-[232px] max-w-full shrink rounded-xl object-cover shadow-[0_14px_40px_rgb(0_0_0/0.45)] ring-1 ring-black/40"
      />
    );
  }
  const text = prompt.text[locale];
  return (
    <p
      lang={locale}
      className="leading-[1.05] font-extrabold text-balance text-accent hyphens-auto [overflow-wrap:anywhere]"
      style={{ fontSize: `${promptSize(text)}px` }}
    >
      {text}
    </p>
  );
}

/**
 * A question: the outcome region, the question and its prompt, the options and a hint line.
 * The outcome region and the hint line stay mounted across questions, so screen readers hear
 * each change; the options arm afresh for each position.
 */
export function QuestionCard({
  question,
  marks,
  outcome,
  hint,
  disabled,
  onAnswer,
  onHoldChange,
}: {
  question: Pick<Question, "position" | "type" | "prompt" | "options">;
  marks: Marks | null;
  /** The content of the persistent `role=status` region: the reveal, a toast. */
  outcome: ReactNode;
  /** The line under the options: the hold hint or what comes next. */
  hint: string;
  disabled: boolean;
  onAnswer: (option: number) => void;
  onHoldChange: (holding: boolean) => void;
}): ReactNode {
  const t = useMessages(messages);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const howId = useId();
  const { position } = question;
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const armed = armedAt === position;
  const flagOptions = question.options[0].kind === "flag";

  // A new question takes focus, so a screen reader reads it and Tab reaches its options.
  useEffect(() => {
    headingRef.current?.focus();
    const timer = setTimeout(() => setArmedAt(position), armingMs);
    return () => clearTimeout(timer);
  }, [position]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 py-4 text-center">
        <div role="status" className="flex flex-col items-center empty:hidden">
          {outcome}
        </div>
        <div
          key={position}
          className="flex min-h-0 flex-col items-center gap-[18px] motion-safe:animate-enter"
        >
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="max-w-xs text-[21px] leading-tight font-bold text-balance outline-none"
          >
            {t.questions[question.type]}
          </h2>
          <Prompt question={question} />
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
          <li key={`${position}-${i}`}>
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
      <p
        aria-live="polite"
        className="mt-2.5 min-h-5 text-center text-sm font-semibold text-foreground-muted"
      >
        {hint}
      </p>
    </>
  );
}
