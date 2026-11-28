import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { challengeQuery, type Challenge } from "@/features/challenge/api";
import {
  challengeError,
  messages,
  startError,
} from "@/features/challenge/messages";
import { messages as boardMessages } from "@/features/leaderboard/messages";
import { RankRow } from "@/features/leaderboard/rank-row";
import { meQuery } from "@/features/play/api";
import { NameForm } from "@/features/play/name-form";
import { ApiError, useApiClient } from "@/lib/api";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

const pollMs = 5000;

/** The quiz's board, with an empty "Du" slot where a challenged visitor lands. */
function Board({
  top,
  slot,
}: {
  top: Challenge["top"];
  slot: boolean;
}): ReactNode {
  const t = useMessages(messages);
  const board = useMessages(boardMessages);
  if (top.length === 0 && !slot) return null;
  return (
    <ol className="mt-4 flex w-full flex-col gap-1.5">
      {top.map((entry, i) => (
        // Names repeat and ranks tie; the position is the row's identity.
        <RankRow key={i} entry={entry} youSuffix={board.youSuffix} />
      ))}
      {slot && (
        <li className="flex min-h-11 items-center gap-3 rounded-chip border-2 border-dashed border-border px-3.5 text-[17px] text-foreground-muted">
          <span
            aria-hidden="true"
            className="w-[26px] text-center font-extrabold"
          >
            ?
          </span>
          <span className="flex-1 font-semibold">{t.you}</span>
        </li>
      )}
    </ol>
  );
}

/** The creator's score in a gold medallion. */
function Medallion({ score }: { score: number }): ReactNode {
  return (
    <p className="my-3.5 flex size-[148px] items-center justify-center rounded-full bg-accent text-[72px] leading-[0.85] font-extrabold text-accent-ink tabular-nums shadow-[0_0_0_10px_var(--color-surface),0_0_0_12px_var(--color-border)]">
      {score}
    </p>
  );
}

function Waiting(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className="flex size-[148px] items-center justify-center gap-2 rounded-full bg-surface shadow-[0_0_0_2px_var(--color-border)]"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-motion=""
          className="size-3 rounded-full bg-accent motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * `/q/:quizId`: waiting while the creator plays, then the creator's score, the quiz board and
 * the accept hold; the player's own quiz takes a plain Play; a hidden creator shows no head.
 */
export function ChallengePage(): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const api = useApiClient();
  const quizId = useParams().quizId ?? "";
  const me = useQuery(meQuery(api));
  const query = useQuery({
    ...challengeQuery(api, quizId),
    refetchInterval: (q) =>
      q.state.data?.creator && !q.state.data.creator.ended ? pollMs : false,
  });
  /** Whether this visit saw the creator still playing, so the opening is news. */
  const [waited, setWaited] = useState(false);

  if (query.isPending) {
    return (
      <p role="status" className="sr-only">
        {t.loading}
      </p>
    );
  }
  if (query.isError) {
    const missing =
      query.error instanceof ApiError && query.error.code === "quiz_not_found";
    return (
      <EmptyState icon={<CircleAlert />}>
        <p role="alert" className="text-lg text-danger">
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

  const { creator, top } = query.data;
  // The server refuses a run on the quiz while its creator run plays.
  const waiting = creator !== null && !creator.ended;
  if (waiting && !waited) setWaited(true);
  const own = creator?.own ?? false;
  const lastName = me.data?.lastName ?? null;

  let head: ReactNode = null;
  if (creator && waiting) {
    head = (
      <>
        <Waiting />
        <h1 className="mt-3.5 text-[28px] leading-[1.1] font-extrabold">
          {t.waitingTitle(creator.name)}
        </h1>
        <p className="max-w-[300px] text-[17px] leading-snug text-foreground-soft">
          {t.waitingBody(creator.name)}
        </p>
      </>
    );
  } else if (creator && own) {
    head = (
      <>
        <h1 className="text-[26px] font-extrabold">{t.ownQuizTitle}</h1>
        <Medallion score={creator.score} />
        <p className="text-[17px] text-foreground-soft">
          {t.ownQuizBody(creator.score)}
        </p>
      </>
    );
  } else if (creator) {
    head = (
      <>
        <h1 className="text-[26px] font-extrabold">
          {t.challengedBy(creator.name)}
        </h1>
        <Medallion score={creator.score} />
        <p className="text-[17px] text-foreground-soft">
          {t.target(creator.score + 1)}
        </p>
      </>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-3.5">
      <p role="status" className="sr-only">
        {waited && !waiting ? t.unlocked : ""}
      </p>
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        {head}
        {!waiting && <Board top={top} slot={!own} />}
      </div>
      <NameForm
        quizId={query.data.id}
        lastName={lastName}
        action={own ? "play" : "accept"}
        label={waiting ? t.waitingName : undefined}
        blockedLabel={
          creator && waiting ? t.waitingButton(creator.name) : undefined
        }
        errorText={startError}
      />
      {waiting && (
        <Link
          to="/"
          className="flex min-h-11 items-center justify-center rounded-chip text-base font-bold text-accent"
        >
          {t.waitingOwnGame}
        </Link>
      )}
    </section>
  );
}
