import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCoarsePointer } from "@/components/ui/hold-button";
import { isTooFast, meQuery } from "@/features/play/api";
import { passedTarget, type GapTarget } from "@/features/play/gap";
import { GapPill } from "@/features/play/gap-pill";
import { LevelPips } from "@/features/play/level-pips";
import { messages, playError } from "@/features/play/messages";
import { QuestionCard } from "@/features/play/question-card";
import { RunResult } from "@/features/play/run-result";
import { StreakPill } from "@/features/play/streak-pill";
import { TimerBar } from "@/features/play/timer-bar";
import { Toast } from "@/features/play/toast";
import { useRun } from "@/features/play/use-run";
import { useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** How long an outcome shows: a correct answer, one with a toast, a miss. */
const revealMs = 650;
const toastRevealMs = 1100;
const missRevealMs = 1300;

function RunLoading(): ReactNode {
  const t = useMessages(messages);
  const block = "rounded-option bg-surface motion-safe:animate-pulse";
  return (
    <div className="flex flex-1 flex-col">
      <p role="status" className="sr-only">
        {t.loading}
      </p>
      <div aria-hidden="true" className="flex flex-1 flex-col">
        <div className="flex h-12 items-center justify-between">
          <div className={`h-2 w-[180px] ${block}`} />
          <div className={`h-10 w-20 rounded-full ${block}`} />
        </div>
        <div className={`mt-2.5 h-3 rounded-full ${block}`} />
        <div className="flex flex-1 items-center justify-center">
          <div className={`aspect-4/3 w-[232px] ${block}`} />
        </div>
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-16 ${block}`} />
          ))}
        </div>
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
  const api = useApiClient();
  const coarse = useCoarsePointer();
  // Read once at mount: the record stays the run's target even when the player beats it.
  const me = useQuery({
    ...meQuery(api),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const best = me.data?.best ?? null;
  const target: GapTarget | null =
    best === null ? null : { kind: "record", score: best };
  const [holding, setHolding] = useState(false);
  const { query, reveal, busy, answerError, answer, expire, holdChange } =
    useRun(runId, (outcome) => {
      if (!outcome.correct) return missRevealMs;
      return passedTarget(target, outcome.score) ? toastRevealMs : revealMs;
    });
  const onHoldChange = useCallback(
    (active: boolean) => {
      setHolding(active);
      holdChange(active);
    },
    [holdChange],
  );

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
  if (state.result) {
    return <RunResult run={state} result={state.result} creator={null} />;
  }
  const question = state.question;
  if (!question) return null;

  // A refetch can land before the reveal clears; marks belong to their own position only.
  const shown = reveal?.position === question.position ? reveal : null;
  const score = shown?.score ?? state.score;
  // A first run is one whose player had no ended run; a failed /api/me counts as one.
  const firstRun = !me.isPending && best === null;

  let outcome: ReactNode = null;
  let hint = "";
  if (shown?.correct) {
    outcome = (
      <>
        <span className="sr-only">{t.correct}</span>
        {passedTarget(target, shown.score) && best !== null && (
          <Toast title={t.toastRecord} body={t.toastRecordBody(best)} />
        )}
      </>
    );
    hint = shown.finished ? t.resultSoon : t.nextSoon;
  } else if (shown) {
    const title = shown.timedOut
      ? t.timedOut
      : isTooFast(shown)
        ? t.tooFast
        : t.wrong;
    outcome = (
      <div className="flex flex-col items-center gap-0.5 rounded-card border-2 border-danger bg-[#2B1F3F] px-5 py-3">
        <strong className="text-[22px] text-[#FF8A96]">{title}</strong>
        <span className="text-base text-foreground-soft">{t.revealHint}</span>
      </div>
    );
    hint = t.resultSoon;
  } else if (coarse && firstRun && question.position < 3) {
    hint = holding ? t.holding : t.holdHint;
  }

  return (
    <section className="flex min-h-full flex-1 flex-col pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {failure}
      <h1 className="sr-only">{state.name}</h1>
      <div className="flex min-h-12 items-center justify-between gap-3">
        <LevelPips
          position={question.position}
          answered={shown?.correct ?? false}
          missed={shown !== null && !shown.correct}
        />
        <div className="flex flex-col items-end gap-0.5">
          <StreakPill
            score={score}
            passed={target !== null && score > target.score}
            pop={shown?.correct ?? false}
          />
          {target && <GapPill target={target} score={score} />}
        </div>
      </div>
      <TimerBar
        key={`timer-${question.position}`}
        deadline={question.deadline}
        limitMs={question.limitMs}
        serverNow={state.serverNow}
        receivedAt={receivedAt}
        paused={busy}
        onExpire={expire}
      />
      <QuestionCard
        question={question}
        marks={
          shown
            ? { correct: shown.correctOption, chosen: shown.chosenOption }
            : null
        }
        outcome={outcome}
        hint={hint}
        disabled={busy}
        onAnswer={answer}
        onHoldChange={onHoldChange}
      />
      {answerError && (
        <p role="alert" className="mt-3 text-[15px] text-danger">
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
