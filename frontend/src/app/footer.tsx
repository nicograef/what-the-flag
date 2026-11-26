import type { ReactNode } from "react";
import { messages } from "@/app/messages";
import { useMessages } from "@/lib/i18n/messages";

const noticeUrl = "https://github.com/nicograef/what-the-flag/blob/main/NOTICE";

export function Footer(): ReactNode {
  const t = useMessages(messages);

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-3xl px-4 py-4 text-xs text-muted-foreground">
        <a href={noticeUrl} className="hover:underline">
          {t.credits}
        </a>
      </div>
    </footer>
  );
}
