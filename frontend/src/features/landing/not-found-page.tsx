import type { ReactNode } from "react";
import { Link } from "react-router";
import { messages } from "@/features/landing/messages";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/lib/i18n/messages";

export function NotFoundPage(): ReactNode {
  const t = useMessages(messages);

  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="font-heading text-2xl font-bold">{t.notFound}</h1>
      <Button asChild variant="outline">
        <Link to="/">{t.home}</Link>
      </Button>
    </section>
  );
}
