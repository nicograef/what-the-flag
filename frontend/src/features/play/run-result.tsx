import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Globe, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useMedia } from "@/components/ui/hold-button";
import {
  isTooFast,
  meKey,
  startRun,
  type RunResultData,
  type RunState,
} from "@/features/play/api";
import { ItemView } from "@/features/play/item-view";
import { messages, playError } from "@/features/play/messages";
import {
  selectHead,
  type ResultAction,
  type ResultCreator,
} from "@/features/play/result-head";
import { RunStrip } from "@/features/play/run-strip";
import { ShareButton } from "@/features/play/share-button";
import { runCells } from "@/features/play/strip";
import { useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

/** How long after the result renders its buttons ignore activation. */
const resultGuardMs = 1000;

type Missed = NonNullable<RunResultData["last"]>;

/** The quiz's creator with the name the challenge rows show. */
export type Creator = ResultCreator & { name: string };

function MissedQuestion({
  last,
  tooFast,
}: {
  last: Missed;
  tooFast: boolean;
}): ReactNode {
  const t = useMessages(messages);
  const titleId = useId();
  const rows = [
    { option: last.correctOption, correct: true },
    ...(last.chosenOption !== null && last.chosenOption !== last.correctOption
      ? [{ option: last.chosenOption, correct: false }]
      : []),
  ];

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-[inset_0_0_0_2px_var(--color-accent)]"
    >
      <h2 id={titleId} className="text-[15px] font-extrabold text-accent">
        {t.missed}
      </h2>
      <div className="flex items-center gap-3">
        <div className="shrink-0 text-lg font-bold">
          <ItemView
            item={last.prompt}
            alt={t.flag}
            width={64}
            height={48}
            className="h-12 w-16 rounded-md object-cover ring-1 ring-black/40"
          />
        </div>
        <p className="text-base text-foreground-soft">
          {t.questions[last.type]}
        </p>
      </div>
      <ul className="flex gap-2">
        {rows.map(({ option, correct }) => {
          const Icon = correct ? Check : X;
          return (
            <li
              key={option}
              className={cn(
                "flex min-h-11 flex-1 items-center gap-1.5 rounded-chip px-3 text-lg font-extrabold",
                correct
                  ? "bg-success text-success-ink"
                  : "bg-danger text-danger-ink",
              )}
            >
              <Icon
                aria-hidden="true"
                className="size-[18px] shrink-0"
                strokeWidth={3.2}
              />
              <ItemView
                item={last.options[option]}
                alt={t.flagOption(option + 1)}
                width={40}
                height={30}
                className="h-8 w-auto rounded-sm"
              />
              <span className="sr-only">
                , {correct ? t.correctAnswer : t.yourAnswer}
              </span>
            </li>
          );
        })}
      </ul>
      {tooFast && <p className="text-base">{t.tooFastEnd}</p>}
    </section>
  );
}

/** One gold square per country of a completed run. */
function CompletedSquares({ score }: { score: number }): ReactNode {
  const t = useMessages(messages);
  return (
    <div
      role="img"
      aria-label={t.runStripCompleted(score)}
      className="flex flex-wrap justify-center gap-[3px] rounded-[18px] bg-surface p-3.5"
    >
      {Array.from({ length: score }, (_, i) => (
        <span
          key={i}
          data-square="correct"
          className="size-2.5 rounded-[2px] bg-accent"
        />
      ))}
    </div>
  );
}

/** How far the run came toward a new record: the gap and a bar to the best before it. */
function GapBar({
  previous,
  score,
}: {
  previous: number;
  score: number;
}): ReactNode {
  const t = useMessages(messages);
  const labelId = useId();
  const target = previous + 1;
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] bg-surface px-4 py-3.5">
      <p className="flex justify-between text-[17px] font-bold">
        <span id={labelId}>{t.gapToRecord(target - score)}</span>
        <span aria-hidden="true" className="text-foreground-muted tabular-nums">
          {previous}
        </span>
      </p>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={score}
        className="h-3 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.round((score / target) * 100)}%` }}
        />
      </div>
    </div>
  );
}

const confettiColours = ["#FFC93C", "#34D399", "#FF6B7A", "#7DD3FC", "#FF9F43"];

/** Pieces that fall once over a record; none under reduced motion. */
function Confetti(): ReactNode {
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  if (reduced) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      {Array.from({ length: 18 }, (_, i) => (
        <span
          key={i}
          data-motion=""
          className="absolute -top-4 h-4 w-2.5 animate-confetti rounded-[2px]"
          style={{
            left: `${(i * 37) % 100}%`,
            background: confettiColours[i % confettiColours.length],
            animationDelay: `${(i % 6) * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The end of a run: the head of the result table's first matching row, its sections, and its
 * two actions in a sticky bar that ignores activation for the first second.
 */
export function RunResult({
  run,
  result,
  creator,
}: {
  run: RunState;
  result: RunResultData;
  creator: Creator | null;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [guarded, setGuarded] = useState(true);
  const { best, score } = result;
  const layout = selectHead(result, creator);
  const record = layout.head === "headFirst" || layout.head === "headRecord";
  const tooFast =
    result.endReason === "wrong" &&
    result.last !== null &&
    isTooFast(result.last);
  const again = useMutation({
    mutationFn: () => startRun(api, { name: run.name }),
    onSuccess: async ({ runId }) => {
      void queryClient.invalidateQueries({
        queryKey: meKey,
        refetchType: "none",
      });
      await navigate(`/play/${runId}`);
    },
  });

  // The run's end unmounts the focused option, so the result takes focus and gets read out.
  useEffect(() => {
    headingRef.current?.focus();
    const timer = setTimeout(() => setGuarded(false), resultGuardMs);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: meKey,
      refetchType: "none",
    });
  }, [queryClient]);

  const creatorName = creator?.name ?? "";
  const heads = {
    headCompleted: t.headCompleted,
    wonTitle: t.wonTitle(creatorName),
    tiedTitle: t.tiedTitle(creatorName),
    headBehind: t.headBehind((creator?.score ?? 0) + 1 - score, creatorName),
    headFirst: t.headFirst,
    headRecord: t.headRecord,
    headTied: t.headTied,
    headNearMiss: t.headNearMiss,
    headTimeout: t.headTimeout,
    headOver: t.headOver,
  };

  const worldRank = result.globalRank !== null && (
    <Link to="/leaderboard" className="font-bold text-accent">
      {best.isNew
        ? t.scoreWorldRank(result.globalRank)
        : t.scoreBestRank(result.globalRank)}
    </Link>
  );
  let subline: ReactNode;
  if (layout.subline === "quizRankLine") {
    subline = t.quizRankLine(result.quizRank, creatorName);
  } else if (layout.subline === "recordLine" && best.previous !== null) {
    subline = (
      <>
        {t.recordLine(best.previous)}
        {worldRank}
      </>
    );
  } else {
    subline = (
      <>
        {t.scoreLine}
        {worldRank}
      </>
    );
  }

  const cells = runCells(result);
  const stripLabel =
    result.endReason === "timeout"
      ? t.runStripTimeout(score)
      : t.runStripWrong(score);

  function action(kind: ResultAction, primary: boolean): ReactNode {
    const variant = primary ? "primary" : "secondary";
    const size = primary ? "min-h-[72px] w-full text-[26px]" : "w-full";
    switch (kind) {
      case "playAgain":
      case "ownGameWorld":
        return (
          <Button
            variant={variant}
            guarded={guarded || again.isPending}
            className={size}
            onClick={() => again.mutate()}
          >
            {kind === "playAgain" && <RotateCcw aria-hidden="true" />}
            {kind === "playAgain" ? t.playAgain : t.ownGameWorld}
          </Button>
        );
      case "shareRun":
      case "shareRecord":
      case "shareCompleted":
      case "tellCreator": {
        const labels = {
          shareRun: t.shareRun(score),
          shareRecord: t.shareRecord,
          shareCompleted: t.shareCompleted,
          tellCreator: t.tellCreator(creatorName),
        };
        return (
          <ShareButton
            quizId={run.quizId}
            score={score}
            label={labels[kind]}
            variant={variant}
            guarded={guarded}
            className={size}
          />
        );
      }
    }
  }

  return (
    <section className="relative flex flex-1 flex-col gap-3.5 pt-2 motion-safe:animate-enter">
      {record && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[-120px] left-1/2 -ml-[260px] size-[520px] rounded-full bg-[radial-gradient(circle,rgb(255_201_60/0.22),rgb(255_201_60/0)_65%)]"
          />
          <Confetti />
        </>
      )}
      <header className="relative flex flex-col items-center text-center">
        {record && (
          <Crown
            aria-hidden="true"
            className="size-11 fill-accent text-accent"
          />
        )}
        {layout.head === "headCompleted" && (
          <Globe aria-hidden="true" className="size-12 text-accent" />
        )}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={cn(
            "outline-none",
            record
              ? "text-[26px] font-extrabold text-accent"
              : layout.head === "headCompleted"
                ? "mt-1 text-[30px] leading-[1.05] font-extrabold"
                : "text-xl font-bold text-foreground-muted",
          )}
        >
          {heads[layout.head]}
        </h1>
        <p
          className={cn(
            "leading-[0.9] font-extrabold tabular-nums",
            layout.head === "headCompleted"
              ? "text-[104px] text-accent"
              : record
                ? "text-[96px]"
                : "text-[84px]",
          )}
        >
          {score}
        </p>
        <p className="text-[17px] text-foreground-soft">{subline}</p>
        {layout.subline === "quizRankLine" && best.isNew && (
          <p className="mt-2 rounded-full bg-accent px-3.5 py-1 text-[15px] font-extrabold text-accent-ink">
            {best.previous === null
              ? t.recordBadgeFirst
              : t.recordBadge(best.previous)}
          </p>
        )}
      </header>
      {layout.sections.map((section) => {
        switch (section) {
          case "completedSquares":
            return <CompletedSquares key={section} score={score} />;
          case "runStrip":
            return <RunStrip key={section} cells={cells} label={stripLabel} />;
          case "learningCard":
            return (
              result.last && (
                <MissedQuestion
                  key={section}
                  last={result.last}
                  tooFast={tooFast}
                />
              )
            );
          case "gapBar":
            return (
              best.previous !== null && (
                <GapBar key={section} previous={best.previous} score={score} />
              )
            );
          case "challengeNote":
            return (
              <p
                key={section}
                className="text-center text-base text-foreground-soft"
              >
                {t.challengeNote}
              </p>
            );
          case "headToHead":
            return null;
        }
      })}
      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-3 bg-background/90 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        {again.isError && (
          <p role="alert" className="text-[15px] text-danger">
            {playError(again.error, locale)}
          </p>
        )}
        {action(layout.primary, true)}
        {layout.secondary && action(layout.secondary, false)}
      </div>
    </section>
  );
}
