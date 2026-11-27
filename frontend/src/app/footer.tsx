import type { ReactNode } from "react";
import { messages } from "@/app/messages";
import { useMessages } from "@/lib/i18n/messages";

const noticeUrl = "https://github.com/nicograef/what-the-flag/blob/main/NOTICE";

export function Footer(): ReactNode {
  const t = useMessages(messages);

  return (
    <footer className="mx-auto w-full max-w-md px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground">
      <a
        href={noticeUrl}
        className="inline-block py-2 underline underline-offset-2"
      >
        {t.credits}
      </a>
    </footer>
  );
}
