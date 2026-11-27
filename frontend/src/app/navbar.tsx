import type { ReactNode } from "react";
import { Link } from "react-router";
import { messages } from "@/app/messages";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

export function Navbar(): ReactNode {
  const t = useMessages(messages);
  const { locale, setLocale } = useLocale();
  const other = locale === "de" ? "en" : "de";

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/" className="font-heading text-lg font-semibold">
          {t.brand}
        </Link>
        <div data-slot="nav-right" className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link to="/leaderboard">{t.leaderboard}</Link>
          </Button>
          <Button variant="ghost" lang={other} onClick={() => setLocale(other)}>
            {t.switchLocale}
          </Button>
        </div>
      </nav>
    </header>
  );
}
