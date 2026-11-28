import type { ReactNode } from "react";
import { Flag } from "lucide-react";
import { Link } from "react-router";
import { messages } from "@/app/messages";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMessages } from "@/lib/i18n/messages";

export function NotFoundPage(): ReactNode {
  const t = useMessages(messages);

  return (
    <EmptyState icon={<Flag />}>
      <h1 className="text-3xl font-extrabold">{t.notFound}</h1>
      <Link to="/" className={`${buttonClass()} w-full`}>
        {t.backHome}
      </Link>
    </EmptyState>
  );
}
