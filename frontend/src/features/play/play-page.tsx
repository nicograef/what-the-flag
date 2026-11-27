import type { ReactNode } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isTooFast } from "@/features/play/api";
import { Countdown } from "@/features/play/countdown";
import { messages, playError } from "@/features/play/messages";
import { QuestionCard } from "@/features/play/question-card";
import { RunResult } from "@/features/play/run-result";
import { useRun } from "@/features/play/use-run";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

function RunError({
  error,
  retrying,
  onRetry,
}: {
  error: Error;
  retrying: boolean;
  onRetry: () => void;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-destructive">
        {playError(error, locale)}
      </p>
      <Button variant="outline" disabled={retrying} onClick={onRetry}>
        {t.retry}
      </Button>
    </div>
  );
}

function Run({ runId }: { runId: string }): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const { query, reveal, busy, answerError, answer } = useRun(runId);

  if (query.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {t.loading}
      </p>
    );
  }
  // A failed refetch keeps the last state, so the run stays playable under the error.
  const failure = query.isError && (
    <RunError
      error={query.error}
      retrying={query.isFetching}
      onRetry={() => void query.refetch()}
    />
  );
  if (!query.data) return failure;

  const { state, receivedAt } = query.data;
  if (state.result) return <RunResult run={state} result={state.result} />;
  const question = state.question;
  if (!question) return null;

  // A refetch can land before the reveal clears; marks belong to their own position only.
  const shown = reveal?.position === question.position ? reveal : null;
  let feedback = "";
  if (shown) {
    if (shown.correct) feedback = t.correct;
    else if (shown.timedOut) feedback = t.timedOut;
    else if (isTooFast(shown)) feedback = t.tooFast;
    else feedback = t.wrong;
  }

  return (
    <section className="flex flex-col gap-4">
      {failure}
      <div className="flex items-center justify-between text-sm">
        <h1 className="font-medium">{state.name}</h1>
        <p className="tabular-nums">{t.score(shown?.score ?? state.score)}</p>
      </div>
      <Countdown
        key={question.position}
        deadline={question.deadline}
        limitMs={question.limitMs}
        serverNow={state.serverNow}
        receivedAt={receivedAt}
        paused={busy}
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
        disabled={busy}
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
