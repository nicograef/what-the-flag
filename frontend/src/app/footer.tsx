import type { ReactNode } from "react";
import { messages } from "@/app/messages";
import { useMessages } from "@/lib/i18n/messages";

const noticeUrl = "https://github.com/nicograef/what-the-flag/blob/main/NOTICE";

/** The data credit line the data licence requires. */
export function Footer(): ReactNode {
  const t = useMessages(messages);

  return (
    <footer className="mx-auto w-full max-w-md px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[13px] font-semibold text-foreground-muted">
      <a
        href={noticeUrl}
        className="inline-flex min-h-11 items-center rounded-chip underline underline-offset-2"
      >
        {t.credits}
      </a>
    </footer>
  );
}
