import type { ReactNode } from "react";
import { messages } from "@/features/play/messages";
import { NameForm } from "@/features/play/name-form";
import { useMessages } from "@/lib/i18n/messages";

export function HomePage(): ReactNode {
  const t = useMessages(messages);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-4xl font-bold">{t.title}</h1>
        <p className="text-lg text-muted-foreground">{t.tagline}</p>
      </div>
      <NameForm />
    </section>
  );
}
