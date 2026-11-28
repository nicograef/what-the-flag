import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { Link, useMatch } from "react-router";
import { messages } from "@/app/messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

const control =
  "flex h-11 min-w-11 items-center justify-center rounded-chip px-2 font-extrabold text-foreground hover:bg-surface";

/** The site header: the wordmark, the leaderboard link (except on the leaderboard) and the language switch. */
export function Navbar(): ReactNode {
  const t = useMessages(messages);
  const { locale, setLocale } = useLocale();
  const other = locale === "de" ? "en" : "de";
  const onLeaderboard = useMatch("/leaderboard") !== null;

  return (
    <header className="pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <Link
          to="/"
          className="-ml-1 flex h-11 items-center gap-2 rounded-chip px-1 text-xl font-extrabold whitespace-nowrap"
        >
          <svg aria-hidden="true" viewBox="0 0 32 32" className="size-[26px]">
            <path className="fill-foreground-muted" d="M5 3h2v27H5z" />
            <path className="fill-accent" d="M8 4h19l-4 6 4 6H8z" />
          </svg>
          {t.brand}
        </Link>
        <div className="flex items-center gap-1">
          {!onLeaderboard && (
            <Link
              to="/leaderboard"
              aria-label={t.leaderboard}
              className={control}
            >
              <Trophy aria-hidden="true" className="size-6" />
            </Link>
          )}
          <button
            type="button"
            className={control}
            lang={other}
            aria-label={t.switchLocale}
            onClick={() => setLocale(other)}
          >
            {t.switchLocaleShort}
          </button>
        </div>
      </nav>
    </header>
  );
}
