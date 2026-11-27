import type { ReactNode } from "react";
import { Languages, Trophy } from "lucide-react";
import { Link, NavLink } from "react-router";
import { messages } from "@/app/messages";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

export function Navbar(): ReactNode {
  const t = useMessages(messages);
  const { locale, setLocale } = useLocale();
  const other = locale === "de" ? "en" : "de";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <Link
          to="/"
          className="-ml-1 flex h-11 items-center gap-2 rounded-lg px-1 text-base font-semibold tracking-tight whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <img src="/favicon.svg" alt="" className="size-7" />
          {t.brand}
        </Link>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" className="min-w-11 px-3">
            <NavLink to="/leaderboard">
              <Trophy aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">{t.leaderboard}</span>
            </NavLink>
          </Button>
          <Button
            variant="ghost"
            className="min-w-11 px-3 font-semibold"
            lang={other}
            aria-label={t.switchLocale}
            onClick={() => setLocale(other)}
          >
            <Languages aria-hidden="true" />
            {t.switchLocaleShort}
          </Button>
        </div>
      </nav>
    </header>
  );
}
