import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { meQuery, type Me } from "@/features/play/api";
import { messages } from "@/features/play/messages";
import { NameForm } from "@/features/play/name-form";
import { useApiClient } from "@/lib/api";
import { useMessages } from "@/lib/i18n/messages";

/** Three tilted flags in CSS stripes; decoration only. */
function FlagCollage(): ReactNode {
  const card =
    "absolute flex overflow-hidden rounded-lg shadow-[0_8px_24px_rgb(0_0_0/0.4)]";
  return (
    <div aria-hidden="true" className="relative h-[140px] w-[240px]">
      <div className={`${card} top-6 left-0 h-[84px] w-28 -rotate-12 flex-col`}>
        <div className="flex-1 bg-black" />
        <div className="flex-1 bg-[#DD0000]" />
        <div className="flex-1 bg-[#FFCE00]" />
      </div>
      <div className={`${card} top-6 right-0 h-[84px] w-28 rotate-12`}>
        <div className="flex-1 bg-[#002B7F]" />
        <div className="flex-1 bg-[#FCD116]" />
        <div className="flex-1 bg-[#CE1126]" />
      </div>
      <div
        className={`${card} top-0 left-[54px] h-[99px] w-[132px] shadow-[0_12px_32px_rgb(0_0_0/0.5)] outline-3 outline-foreground`}
      >
        <div className="flex-1 bg-[#169B62]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#FF883E]" />
      </div>
    </div>
  );
}

function FirstVisit(): ReactNode {
  const t = useMessages(messages);
  const rules = [t.rule1, t.rule2, t.rule3];

  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] text-center">
        <FlagCollage />
        <h1 className="max-w-[11ch] text-[44px] leading-none font-extrabold text-balance">
          {t.headline}
        </h1>
        <ol className="flex flex-col gap-1.5 text-left text-[17px] text-foreground-soft">
          {rules.map((rule, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface font-extrabold text-accent"
              >
                {i + 1}
              </span>
              {rule}
            </li>
          ))}
        </ol>
      </div>
      <NameForm lastName={null} action="start" />
    </section>
  );
}

function Returning({ me }: { me: Me }): ReactNode {
  const t = useMessages(messages);

  return (
    <section className="flex flex-1 flex-col gap-3.5">
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        {me.best === null ? (
          <h1 className="sr-only">{t.headline}</h1>
        ) : (
          <>
            <h1 className="text-[17px] text-foreground-muted">
              {t.yourRecord}
            </h1>
            <p className="text-[96px] leading-[0.9] font-extrabold tabular-nums">
              {me.best}
            </p>
          </>
        )}
        {me.worldRank !== null && (
          <p className="mt-1.5 rounded-full bg-surface px-3.5 py-1 text-[15px] font-bold">
            {t.worldRankMeta(me.worldRank)}
          </p>
        )}
      </div>
      {me.lastQuizId !== null && (
        <Link
          to={`/q/${me.lastQuizId}`}
          className="flex min-h-14 items-center justify-between gap-3 rounded-card bg-surface px-4 text-lg font-bold"
        >
          {t.lastQuiz}
          <ChevronRight aria-hidden="true" className="size-6" />
        </Link>
      )}
      <NameForm lastName={me.lastName} action="play" />
    </section>
  );
}

/**
 * The start page: the first-visit layout while the server knows no name, or `/api/me` fails;
 * the returning layout with the record and a one-press Play otherwise.
 */
export function HomePage(): ReactNode {
  const api = useApiClient();
  const me = useQuery(meQuery(api));

  if (me.isPending) return null;
  if (!me.data?.lastName) return <FirstVisit />;
  return <Returning me={me.data} />;
}
