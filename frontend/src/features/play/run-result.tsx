import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
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
  const again = useMutation({
    mutationFn: () => startRun(api, { name: run.name }),
    onSuccess: async ({ runId }) => {
      await navigate(`/play/${runId}`);
    },
  });

  return (
    <section className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <h1 className="font-heading text-2xl font-bold">{t.resultTitle}</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-heading text-4xl font-bold tabular-nums">
            {t.resultScore(result.score)}
          </p>
          <p className="text-muted-foreground">
            {t.endReasons[result.endReason]}
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
