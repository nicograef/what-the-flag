import { useMutation } from "@tanstack/react-query";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ownRunState } from "@/features/leaderboard/own-run";
import {
  isTooFast,
  startRun,
  type RunResultData,
  type RunState,
} from "@/features/play/api";
import { messages, playError } from "@/features/play/messages";
import { recordScore } from "@/features/play/personal-best";
import { ItemView } from "@/features/play/question-card";
import { ShareButton } from "@/features/play/share-button";
import { useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

type Missed = NonNullable<RunResultData["last"]>;

function MissedQuestion({ last }: { last: Missed }): ReactNode {
  const t = useMessages(messages);
  const rows = [
    { option: last.correctOption, correct: true },
    ...(last.chosenOption !== null && last.chosenOption !== last.correctOption
      ? [{ option: last.chosenOption, correct: false }]
      : []),
  ];

  return (
    <Card className="gap-3 p-4">
      <p className="text-sm font-medium text-muted-foreground">{t.missed}</p>
      <div className="flex items-center gap-3">
        <div className="shrink-0 text-lg font-bold">
          <ItemView
            item={last.prompt}
            alt={t.flag}
            width={64}
            height={48}
            className="h-12 w-auto rounded ring-1 ring-foreground/10"
          />
        </div>
        <h2 className="text-sm font-semibold">{t.questions[last.type]}</h2>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(({ option, correct }) => {
          const Icon = correct ? Check : X;
          return (
            <li
              key={option}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-sm font-medium",
                correct
                  ? "border-success bg-success/10"
                  : "border-destructive bg-destructive/10",
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4",
                  correct ? "text-success" : "text-destructive",
                )}
              />
              <ItemView
                item={last.options[option]}
                alt={t.flagOption(option + 1)}
                width={40}
                height={30}
                className="h-8 w-auto"
              />
              <span className="sr-only">
                , {correct ? t.correctAnswer : t.yourAnswer}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function StatTile({
  label,
  value,
  caption,
  highlight = false,
}: {
  label: string;
  value: string | number;
  caption: string;
  highlight?: boolean;
}): ReactNode {
  return (
    <li
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-2xl bg-card px-2 py-3 text-center ring-1 ring-border",
        highlight && "ring-2 ring-primary",
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="text-2xl font-bold tabular-nums">
        {value}
      </span>
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        {caption}
      </span>
    </li>
  );
}

const rankingLinkClass =
  "flex h-12 items-center justify-between px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted";

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
    <section className="flex flex-1 flex-col gap-4 motion-safe:animate-enter">
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-muted-foreground outline-none"
        >
          {t.resultTitle}
        </h1>
        <p className="flex flex-col items-center">
          <span className="sr-only">{t.resultScore(result.score)}</span>
          <span
            aria-hidden="true"
            className="text-7xl leading-none font-bold tracking-tight tabular-nums"
          >
            {result.score}
          </span>
          <span
            aria-hidden="true"
            className="mt-1 text-base font-medium text-muted-foreground"
          >
            {t.resultScoreLabel(result.score)}
          </span>
        </p>
        {best.isNew && (
          <p className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-primary-foreground motion-safe:animate-pop">
            <Sparkles aria-hidden="true" className="size-4" />
            {t.newBest}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {tooFast ? t.tooFastEnd : t.endReasons[result.endReason]}
        </p>
      </div>
      <ul
        className={cn(
          "grid gap-2",
          result.globalRank !== null ? "grid-cols-3" : "grid-cols-2",
        )}
      >
        <StatTile
          label={t.quizRank(result.quizRank)}
          value={t.rankValue(result.quizRank)}
          caption={t.statQuiz}
        />
        {result.globalRank !== null && (
          <StatTile
            label={t.globalRank(result.globalRank)}
            value={t.rankValue(result.globalRank)}
            caption={t.statWorld}
          />
        )}
        <StatTile
          label={t.best(best.best)}
          value={best.best}
          caption={t.statBest}
          highlight={best.isNew}
        />
      </ul>
      {result.last && <MissedQuestion last={result.last} />}
      <Card className="gap-0 divide-y divide-border py-0">
        <Link
          to={`/q/${run.quizId}`}
          state={ownRunState(run.id)}
          className={rankingLinkClass}
        >
          <span>{t.quizRanking}</span>
          <ChevronRight
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </Link>
        <Link
          to="/leaderboard"
          state={ownRunState(run.id)}
          className={rankingLinkClass}
        >
          <span>{t.globalRanking}</span>
          <ChevronRight
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
        </Link>
      </Card>
      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 bg-background/85 px-4 pt-3 pb-1 backdrop-blur-md">
        {again.isError && (
          <p role="alert" className="text-sm text-destructive">
            {playError(again.error, locale)}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ShareButton
            quizId={run.quizId}
            score={result.score}
            className="w-full"
          />
          <Button
            size="lg"
            className="w-full"
            disabled={again.isPending}
            onClick={() => again.mutate()}
          >
            {again.isPending ? t.starting : t.playAgain}
          </Button>
        </div>
      </div>
    </section>
  );
}
