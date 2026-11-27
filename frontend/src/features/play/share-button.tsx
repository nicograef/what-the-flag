import { Check, Share2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

const copiedMs = 2000;

/** Shares the challenge link: the share sheet where the browser has one, else the clipboard. */
export function ShareButton({
  quizId,
  score,
  className,
}: {
  quizId: string;
  score: number;
  className?: string;
}): ReactNode {
  const t = useMessages(messages);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), copiedMs);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share(): Promise<void> {
    const text = t.shareText(score);
    const url = `${window.location.origin}/q/${quizId}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url });
      } catch {
        // The player closed the share sheet.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
    } catch {
      // Clipboard access was denied; the button stays as it is.
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        className={className}
        onClick={() => void share()}
      >
        {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
        {copied ? t.copiedShort : t.share}
      </Button>
      <span role="status" className="sr-only">
        {copied ? t.copied : ""}
      </span>
    </>
  );
}
