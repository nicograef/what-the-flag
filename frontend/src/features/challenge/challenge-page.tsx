import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getChallenge, type Challenge } from "@/features/challenge/api";
import { challengeError, messages } from "@/features/challenge/messages";
import { RankingTable } from "@/features/leaderboard/ranking-table";
import { NameForm } from "@/features/play/name-form";
import { useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

function CreatorLine({ creator }: Pick<Challenge, "creator">): ReactNode {
  const t = useMessages(messages);
  if (!creator) return null;
  return (
    <p className="text-lg">
      {creator.ended
        ? t.creatorScore(creator.name, creator.score)
        : t.stillPlaying(creator.name)}
    </p>
  );
}

export function ChallengePage(): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const quizId = useParams().quizId ?? "";
  const run = useSearchParams()[0].get("run");
  const query = useQuery({
    queryKey: ["quiz", quizId, run],
    queryFn: () => getChallenge(api, quizId, run),
  });

  if (query.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {t.loading}
      </p>
    );
  }
  if (query.isError) {
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="font-heading text-2xl font-bold">{t.title}</h1>
        <p role="alert" className="text-destructive">
          {challengeError(query.error, locale)}
        </p>
        <Button asChild variant="outline">
          <Link to="/">{t.home}</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold">{t.title}</h1>
        <CreatorLine creator={query.data.creator} />
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-heading text-xl font-semibold">{t.play}</h2>
        </CardHeader>
        <CardContent>
          <NameForm quizId={query.data.id} />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-xl font-semibold">{t.ranking}</h2>
        <RankingTable entries={query.data.top} caption={t.ranking} />
      </div>
    </section>
  );
}
