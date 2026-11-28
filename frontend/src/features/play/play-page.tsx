import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isTooFast } from "@/features/play/api";
import { Countdown } from "@/features/play/countdown";
import { messages, playError } from "@/features/play/messages";
import { QuestionCard, type Status } from "@/features/play/question-card";
import { RunResult } from "@/features/play/run-result";
import { useRun } from "@/features/play/use-run";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

function RunLoading(): ReactNode {
  const t = useMessages(messages);
  return (
    <div className="flex flex-col">
      <p role="status" className="sr-only">
        {t.loading}
      </p>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-2.5" />
      <Skeleton className="mx-auto mt-3 h-6 w-3/4" />
      <Skeleton className="mx-auto mt-3 aspect-4/3 w-48 rounded-lg" />
      <div className="mt-3 grid gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-13 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function RunError({
  error,
  retrying,
  onRetry,
  banner,
}: {
  error: Error;
  retrying: boolean;
  onRetry: () => void;
  /** Over a live run the error is a banner; without a run it fills the page. */
  banner: boolean;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const alert = (
    <p role="alert" className={banner ? "flex-1 text-sm" : "text-danger"}>
      {playError(error, locale)}
    </p>
  );
  if (!banner) {
    return (
      <EmptyState icon={<CircleAlert />}>
        {alert}
        <Button
          variant="secondary"
          className="w-full"
          disabled={retrying}
          onClick={onRetry}
        >
          {t.retry}
        </Button>
      </EmptyState>
    );
  }
  return (
    <div className="mb-3 flex items-center gap-3 rounded-xl bg-danger/10 p-3">
      <CircleAlert aria-hidden="true" className="shrink-0 text-danger" />
      {alert}
      <Button variant="secondary" disabled={retrying} onClick={onRetry}>
        {t.retry}
      </Button>
    </div>
  );
}

function Run({ runId }: { runId: string }): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const { query, reveal, busy, answerError, answer, expire, holdChange } =
    useRun(runId);

  if (query.isPending) return <RunLoading />;
  // A failed refetch keeps the last state, so the run stays playable under the error.
  const failure = query.isError && (
    <RunError
      error={query.error}
      retrying={query.isFetching}
      onRetry={() => void query.refetch()}
      banner={query.data !== undefined}
    />
  );
  if (!query.data) return failure;

  const { state, receivedAt } = query.data;
  if (state.result) return <RunResult run={state} result={state.result} />;
  const question = state.question;
  if (!question) return null;

  // A refetch can land before the reveal clears; marks belong to their own position only.
  const shown = reveal?.position === question.position ? reveal : null;
  const score = shown?.score ?? state.score;
  let status: Status | null = null;
  if (shown?.correct) status = { text: t.correct, tone: "success" };
  else if (shown?.timedOut) status = { text: t.timedOut, tone: "danger" };
  else if (shown && isTooFast(shown)) {
    status = { text: t.tooFast, tone: "danger" };
  } else if (shown) status = { text: t.wrong, tone: "danger" };

  return (
    <section className="flex min-h-0 flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
      {failure}
      <div className="flex items-center justify-between">
        <h1 className="sr-only">{state.name}</h1>
        <p className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-sm font-semibold">
          {t.question(question.position)}
        </p>
        <p className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-sm font-bold text-accent-ink tabular-nums">
          <span key={score} className="inline-block motion-safe:animate-pop">
            {t.score(score)}
          </span>
        </p>
      </div>
      <Countdown
        key={`timer-${question.position}`}
        deadline={question.deadline}
        limitMs={question.limitMs}
        serverNow={state.serverNow}
        receivedAt={receivedAt}
        paused={busy}
        onExpire={expire}
      />
      <QuestionCard
        key={`question-${question.position}`}
        question={question}
        marks={
          shown
            ? { correct: shown.correctOption, chosen: shown.chosenOption }
            : null
        }
        status={status}
        disabled={busy}
        onAnswer={answer}
        onHoldChange={holdChange}
      />
      {answerError && (
        <p role="alert" className="mt-3 text-sm text-danger">
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
