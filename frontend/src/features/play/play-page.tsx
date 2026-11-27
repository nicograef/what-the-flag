import type { ReactNode } from "react";
import { useParams } from "react-router";
import { Countdown } from "@/features/play/countdown";
import { messages, playError } from "@/features/play/messages";
import { QuestionCard } from "@/features/play/question-card";
import { RunResult } from "@/features/play/run-result";
import { useRun } from "@/features/play/use-run";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

function Run({ runId }: { runId: string }): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const { query, reveal, answering, answerError, answer } = useRun(runId);

  if (query.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {t.loading}
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-destructive">
        {playError(query.error, locale)}
      </p>
    );
  }

  const { state, receivedAt } = query.data;
  if (state.result) return <RunResult run={state} result={state.result} />;
  const question = state.question;
  if (!question) return null;

  // A refetch can land before the reveal clears; marks belong to their own position only.
  const shown = reveal?.position === question.position ? reveal : null;
  let feedback = "";
  if (shown) {
    if (shown.correct) feedback = t.correct;
    else feedback = shown.timedOut ? t.timedOut : t.wrong;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <h1 className="font-medium">{state.name}</h1>
        <p className="tabular-nums">{t.score(shown?.score ?? state.score)}</p>
      </div>
      <Countdown
        key={question.position}
        deadline={question.deadline}
        serverNow={state.serverNow}
        receivedAt={receivedAt}
        paused={answering || reveal !== null}
        onExpire={() => answer(null)}
      />
      <QuestionCard
        key={question.position}
        question={question}
        heading={t.question(question.position)}
        marks={
          shown
            ? { correct: shown.correctOption, chosen: shown.chosenOption }
            : null
        }
        disabled={answering || reveal !== null}
        onAnswer={answer}
      />
      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-center font-medium"
      >
        {feedback}
      </p>
      {answerError && (
        <p role="alert" className="text-sm text-destructive">
          {playError(answerError, locale)}
        </p>
      )}
    </section>
  );
}

export function PlayPage(): ReactNode {
  const { runId = "" } = useParams();
  // A new run id starts from fresh state, not the previous run's reveal.
  return <Run key={runId} runId={runId} />;
}
