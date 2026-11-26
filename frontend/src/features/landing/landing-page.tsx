import type { ReactNode } from "react";
import { useHealth } from "@/features/landing/api";
import { messages } from "@/features/landing/messages";
import { errorMessage } from "@/lib/i18n/error-messages";
import { useLocale } from "@/lib/i18n/locale";
import { useMessages } from "@/lib/i18n/messages";

export function LandingPage(): ReactNode {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const health = useHealth();

  let status: string;
  if (health.isPending) status = t.checking;
  else if (health.isError) status = errorMessage(health.error, locale);
  else status = t.online;

  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-heading text-4xl font-bold">{t.title}</h1>
      <p className="text-lg">{t.tagline}</p>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </section>
  );
}
