import { Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

/** Shares the challenge link: the share sheet where the browser has one, else the clipboard. */
export function ShareButton({
  quizId,
  score,
}: {
  quizId: string;
  score: number;
}): ReactNode {
  const t = useMessages(messages);
  const [copied, setCopied] = useState(false);

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
    <div className="flex items-center gap-3">
      <Button variant="outline" size="lg" onClick={() => void share()}>
        <Share2 aria-hidden="true" />
        {t.share}
      </Button>
      <span role="status" className="text-sm text-muted-foreground">
        {copied ? t.copied : ""}
      </span>
    </div>
  );
}
