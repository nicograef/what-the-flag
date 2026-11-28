import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import { challengeQuery } from "@/features/challenge/api";
import { getLeaderboard, type Entry } from "@/features/leaderboard/api";
import { messages } from "@/features/leaderboard/messages";
import { RankRow } from "@/features/leaderboard/rank-row";
import { meKey, meQuery, startRun, type Me } from "@/features/play/api";
import { messages as playMessages, playError } from "@/features/play/messages";
import { useApiClient } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

type TabId = "world" | "quiz";

const podiumHeights = ["h-32", "h-[92px]", "h-[72px]"];
/** The podium shows 2-1-3 from left to right; the list keeps rank order. */
const podiumOrder = ["order-2", "order-1", "order-3"];
const medals: Record<number, string> = {
  1: "bg-medal-1 text-medal-1-ink",
  2: "bg-medal-2 text-medal-2-ink",
  3: "bg-medal-3 text-medal-3-ink",
};

function Podium({ entries }: { entries: Entry[] }): ReactNode {
  const t = useMessages(messages);
  return (
    <ol className="mt-2.5 grid grid-cols-3 items-end gap-2">
      {entries.map((entry, i) => (
        <li
          // Names repeat and ranks tie; the position is the entry's identity.
          key={i}
          aria-current={entry.own ? "true" : undefined}
          className={cn(
            "flex min-w-0 flex-col items-center gap-1",
            podiumOrder[i],
          )}
        >
          <span className="max-w-full truncate text-base font-bold">
            {entry.name}
            {entry.own && (
              <span className="text-sm font-medium text-foreground-muted">
                {" "}
                {t.youSuffix}
              </span>
            )}
          </span>
          <span
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-t-[14px]",
              podiumHeights[i],
              medals[entry.rank] ?? "bg-surface-2",
            )}
          >
            <span className="text-[30px] leading-none font-extrabold tabular-nums">
              {entry.score}
            </span>
            <span className="text-sm font-bold">{t.rank(entry.rank)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A board: the podium for the first three, then one row per further player. */
function Board({ entries }: { entries: Entry[] }): ReactNode {
  const t = useMessages(messages);
  if (entries.length === 0) {
    return (
      <EmptyState icon={<Trophy />}>
        <p className="text-foreground-muted">{t.empty}</p>
      </EmptyState>
    );
  }
  return (
    <>
      <Podium entries={entries.slice(0, 3)} />
      {entries.length > 3 && (
        <ol className="flex flex-col gap-1 border-t-2 border-surface-2 pt-1.5">
          {entries.slice(3).map((entry, i) => (
            <RankRow key={i} entry={entry} youSuffix={t.youSuffix} />
          ))}
        </ol>
      )}
    </>
  );
}

/** The own world rank from `/api/me`, pinned under a list that does not reach it. */
function PinnedRow({ me }: { me: Me & { worldRank: number } }): ReactNode {
  const t = useMessages(messages);
  const play = useMessages(playMessages);
  const { locale } = useLocale();
  const api = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: () => startRun(api, { name: me.lastName ?? "" }),
    onSuccess: async ({ runId }) => {
      void queryClient.invalidateQueries({
        queryKey: meKey,
        refetchType: "none",
      });
      await navigate(`/play/${runId}`);
    },
  });

  return (
    <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t-2 border-accent bg-surface px-4 pt-3.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {start.isError && (
        <p role="alert" className="text-[15px] text-danger">
          {playError(start.error, locale)}
        </p>
      )}
      <div aria-current="true" className="flex items-center gap-3.5 text-lg">
        <span className="w-8 text-center font-extrabold text-accent tabular-nums">
          {me.worldRank}
        </span>
        <span className="flex-1 font-bold">{t.pinnedYou}</span>
        <strong className="tabular-nums">{me.worldBest}</strong>
        <Button
          guarded={start.isPending}
          className="min-h-11 rounded-[14px] px-4 text-base shadow-none active:translate-y-0"
          onClick={() => start.mutate()}
        >
          {play.play}
        </Button>
      </div>
    </div>
  );
}

function Failure({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  return (
    <EmptyState icon={<CircleAlert />}>
      <p role="alert" className="text-lg text-danger">
        {errorMessage(error, locale)}
      </p>
      <Button variant="secondary" className="w-full" onClick={onRetry}>
        {t.retry}
      </Button>
    </EmptyState>
  );
}

function Loading(): ReactNode {
  const t = useMessages(messages);
  return (
    <p role="status" className="sr-only">
      {t.loading}
    </p>
  );
}

/**
 * The world board and, once the player has one, the board of their latest quiz. The world tab
 * pins the own rank when the list does not reach it.
 */
export function LeaderboardPage(): ReactNode {
  const t = useMessages(messages);
  const api = useApiClient();
  const [tab, setTab] = useState<TabId>("world");
  const me = useQuery(meQuery(api));
  const lastQuizId = me.data?.lastQuizId ?? null;
  const world = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLeaderboard(api),
  });
  const quiz = useQuery({
    ...challengeQuery(api, lastQuizId ?? ""),
    enabled: tab === "quiz" && lastQuizId !== null,
  });
  const shown = tab === "quiz" && lastQuizId !== null ? "quiz" : "world";

  let sub: string | null = t.subWorld;
  let body: ReactNode;
  let pinned: ReactNode = null;
  if (shown === "world") {
    if (world.isPending) body = <Loading />;
    else if (world.isError) {
      body = (
        <Failure error={world.error} onRetry={() => void world.refetch()} />
      );
    } else {
      body = <Board entries={world.data.top} />;
      const worldRank = me.data?.worldRank ?? null;
      if (me.data && worldRank !== null && !world.data.top.some((e) => e.own)) {
        pinned = <PinnedRow me={{ ...me.data, worldRank }} />;
      }
    }
  } else {
    const creator = quiz.data?.creator ?? null;
    sub = creator
      ? creator.own
        ? t.subOwnQuiz
        : t.subLastQuiz(creator.name)
      : null;
    if (quiz.isPending) body = <Loading />;
    else if (quiz.isError) {
      body = <Failure error={quiz.error} onRetry={() => void quiz.refetch()} />;
    } else body = <Board entries={quiz.data.top} />;
  }

  return (
    <section className="flex flex-1 flex-col gap-2">
      <h1 className="text-2xl font-extrabold">{t.title}</h1>
      <Tabs
        label={t.title}
        tabs={[
          { id: "world" as const, label: t.tabWorld },
          ...(lastQuizId === null
            ? []
            : [{ id: "quiz" as const, label: t.tabLastQuiz }]),
        ]}
        selected={shown}
        onSelect={setTab}
      >
        {sub !== null && (
          <p className="mt-0.5 text-center text-sm text-foreground-muted">
            {sub}
          </p>
        )}
        {body}
      </Tabs>
      {pinned}
    </section>
  );
}
