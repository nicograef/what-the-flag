import type { ReactNode } from "react";
import { Flag } from "lucide-react";
import { Link } from "react-router";
import { messages } from "@/app/messages";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMessages } from "@/lib/i18n/messages";

export function NotFoundPage(): ReactNode {
  const t = useMessages(messages);

  return (
    <EmptyState icon={<Flag />}>
      <h1 className="text-2xl font-bold tracking-tight">{t.notFound}</h1>
      <Button asChild size="lg" className="w-full">
        <Link to="/">{t.backHome}</Link>
      </Button>
    </EmptyState>
  );
}
