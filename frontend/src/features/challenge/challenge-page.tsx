import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getChallenge, type Challenge } from "@/features/challenge/api";
import {
  challengeError,
  messages,
  startError,
} from "@/features/challenge/messages";
import { RankingTable } from "@/features/leaderboard/ranking-table";
import { NameForm } from "@/features/play/name-form";
import { RuleChips } from "@/features/play/rule-chips";
import { ApiError, useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

function Creator({ creator }: Pick<Challenge, "creator">): ReactNode {
  const t = useMessages(messages);
  if (!creator) return null;
  if (!creator.ended) {
    return (
      <>
        <Hourglass
          aria-hidden="true"
          className="size-8 text-foreground-muted"
        />
        <p className="text-lg font-semibold">{t.stillPlaying(creator.name)}</p>
        <p className="text-sm text-foreground-muted">{t.autoRefresh}</p>
      </>
    );
  }
  return (
    <p className="flex flex-col items-center">
      <span className="sr-only">
        {t.creatorScore(creator.name, creator.score)}
      </span>
      <span aria-hidden="true" className="text-lg font-semibold">
        {creator.name}
      </span>
      <span
        aria-hidden="true"
        className="text-6xl leading-none font-bold text-accent tabular-nums"
      >
        {creator.score}
      </span>
      <span aria-hidden="true" className="text-sm text-foreground-muted">
        {t.scoreLabel(creator.score)}
      </span>
      <span aria-hidden="true" className="mt-2 text-lg font-semibold">
        {t.beatIt}
      </span>
    </p>
  );
}

export function ChallengePage(): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const quizId = useParams().quizId ?? "";
  const query = useQuery({
    queryKey: ["quiz", quizId],
    queryFn: () => getChallenge(api, quizId),
    refetchInterval: (q) =>
      q.state.data?.creator && !q.state.data.creator.ended ? 5000 : false,
  });

  if (query.isPending) {
    return (
      <section className="flex flex-col gap-6">
        <p role="status" className="sr-only">
          {t.loading}
        </p>
        <Skeleton className="h-36 rounded-2xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
        <Card className="gap-0 divide-y divide-border py-0">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-none" />
          ))}
        </Card>
      </section>
    );
  }
  if (query.isError) {
    const missing =
      query.error instanceof ApiError && query.error.code === "quiz_not_found";
    return (
      <EmptyState icon={<CircleAlert />}>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p role="alert" className="text-danger">
          {challengeError(query.error, locale)}
        </p>
        <Link to="/" className={`${buttonClass()} w-full`}>
          {t.home}
        </Link>
        {!missing && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => void query.refetch()}
          >
            {t.retry}
          </Button>
        )}
      </EmptyState>
    );
  }

  // The server refuses a run on the quiz while its creator run plays.
  const { creator } = query.data;
  const playable = !creator || creator.ended;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <h1 className="text-sm font-semibold text-accent">{t.title}</h1>
        <Creator creator={creator} />
      </div>
      {playable && (
        <>
          <RuleChips />
          <NameForm quizId={query.data.id} errorText={startError} />
        </>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t.ranking}</h2>
        <RankingTable entries={query.data.top} caption={t.ranking} />
      </div>
    </section>
  );
}
