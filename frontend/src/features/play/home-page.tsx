import type { ReactNode } from "react";
import { messages } from "@/features/play/messages";
import { NameForm } from "@/features/play/name-form";
import { RuleChips } from "@/features/play/rule-chips";
import { useMessages } from "@/lib/i18n/messages";

export function HomePage(): ReactNode {
  const t = useMessages(messages);

  return (
    <section className="flex flex-1 flex-col gap-8 sm:flex-none">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center motion-safe:animate-enter sm:flex-none sm:py-12">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-surface shadow-sm ring-1 ring-border">
          <img src="/favicon.svg" alt="" className="size-12" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">{t.title}</h1>
        <p className="max-w-xs text-base text-balance text-foreground-muted">
          {t.tagline}
        </p>
        <RuleChips />
      </div>
      <NameForm />
    </section>
  );
}
