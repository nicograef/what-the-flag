import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ownRunState } from "@/features/leaderboard/own-run";
import {
  isTooFast,
  startRun,
  type RunResultData,
  type RunState,
} from "@/features/play/api";
import { messages, playError } from "@/features/play/messages";
import { recordScore } from "@/features/play/personal-best";
import { QuestionCard } from "@/features/play/question-card";
import { ShareButton } from "@/features/play/share-button";
import { useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

export function RunResult({
  run,
  result,
}: {
  run: RunState;
  result: RunResultData;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const [best] = useState(() => recordScore(run.id, result.score));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tooFast =
    result.endReason === "wrong" &&
    result.last !== null &&
    isTooFast(result.last);
  const again = useMutation({
    mutationFn: () => startRun(api, { name: run.name }),
    onSuccess: async ({ runId }) => {
      await navigate(`/play/${runId}`);
    },
  });

  // The run's end unmounts the focused option, so the result takes focus and gets read out.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-2xl font-bold outline-none"
          >
            {t.resultTitle}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-heading text-4xl font-bold tabular-nums">
            {t.resultScore(result.score)}
          </p>
          <p className="text-muted-foreground">
            {tooFast ? t.tooFastEnd : t.endReasons[result.endReason]}
          </p>
          <ul className="flex flex-col gap-1">
            <li>{t.quizRank(result.quizRank)}</li>
            {result.globalRank !== null && (
              <li>{t.globalRank(result.globalRank)}</li>
            )}
            <li>{t.best(best.best)}</li>
          </ul>
          {best.isNew && (
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              {t.newBest}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              size="lg"
              disabled={again.isPending}
              onClick={() => again.mutate()}
            >
              {t.playAgain}
            </Button>
            <ShareButton quizId={run.quizId} score={result.score} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link
              to={`/q/${run.quizId}`}
              state={ownRunState(run.id)}
              className="underline underline-offset-4"
            >
              {t.quizRanking}
            </Link>
            <Link
              to="/leaderboard"
              state={ownRunState(run.id)}
              className="underline underline-offset-4"
            >
              {t.globalRanking}
            </Link>
          </div>
          {again.isError && (
            <p role="alert" className="text-sm text-destructive">
              {playError(again.error, locale)}
            </p>
          )}
        </CardContent>
      </Card>
      {result.last && (
        <QuestionCard
          question={result.last}
          heading={t.missed}
          marks={{
            correct: result.last.correctOption,
            chosen: result.last.chosenOption,
          }}
        />
      )}
    </section>
  );
}
