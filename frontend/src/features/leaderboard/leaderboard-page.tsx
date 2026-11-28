import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeaderboard } from "@/features/leaderboard/api";
import { messages } from "@/features/leaderboard/messages";
import { RankingTable } from "@/features/leaderboard/ranking-table";
import { useApiClient } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

export function LeaderboardPage(): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const query = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => getLeaderboard(api),
  });

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <>
        <p role="status" className="sr-only">
          {t.loading}
        </p>
        <Card className="gap-0 divide-y divide-border py-0">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-none" />
          ))}
        </Card>
      </>
    );
  } else if (query.isError) {
    body = (
      <EmptyState icon={<CircleAlert />}>
        <p role="alert" className="text-danger">
          {errorMessage(query.error, locale)}
        </p>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void query.refetch()}
        >
          {t.retry}
        </Button>
      </EmptyState>
    );
  } else {
    body = <RankingTable entries={query.data.top} caption={t.title} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-sm text-foreground-muted">{t.intro}</p>
      </div>
      {body}
    </section>
  );
}
