import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getLeaderboard } from "@/features/leaderboard/api";
import { messages } from "@/features/leaderboard/messages";
import { useOwnRun } from "@/features/leaderboard/own-run";
import { RankingTable } from "@/features/leaderboard/ranking-table";
import { useApiClient } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

export function LeaderboardPage(): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const run = useOwnRun();
  const query = useQuery({
    queryKey: ["leaderboard", run],
    queryFn: () => getLeaderboard(api, run),
  });

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <p role="status" className="text-muted-foreground">
        {t.loading}
      </p>
    );
  } else if (query.isError) {
    body = (
      <p role="alert" className="text-destructive">
        {errorMessage(query.error, locale)}
      </p>
    );
  } else {
    body = <RankingTable entries={query.data.top} caption={t.title} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground">{t.intro}</p>
      </div>
      {body}
    </section>
  );
}
