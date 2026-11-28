import { Copy, Share2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

const copiedMs = 2000;

/**
 * Shows what friends receive, then hands the text to the system share sheet where the browser
 * has one, or copies it.
 */
export function ShareSheet({
  open,
  text,
  onClose,
}: {
  open: boolean;
  /** The whole message, link included. */
  text: string;
  onClose: () => void;
}): ReactNode {
  const t = useMessages(messages);
  const [copied, setCopied] = useState(false);
  const native = typeof navigator.share === "function";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), copiedMs);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share(): Promise<void> {
    try {
      await navigator.share({ text });
    } catch {
      // The player closed the system share sheet.
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard access was denied; the button stays as it is.
    }
  }

  return (
    <Sheet
      open={open}
      title={t.sheetTitle}
      closeLabel={t.close}
      onClose={onClose}
    >
      <p className="-mt-2 text-[15px] text-foreground-muted">{t.sheetBody}</p>
      <figure className="w-[300px] max-w-full self-end overflow-hidden rounded-[18px_18px_4px_18px] bg-[#2E6B4F] text-[#F2FFF8]">
        <img
          src="/og.png"
          alt=""
          width={1200}
          height={630}
          className="aspect-[1200/630] w-full object-cover"
        />
        <figcaption className="px-3 pt-2.5 pb-2 text-[15px] leading-snug whitespace-pre-line [overflow-wrap:anywhere]">
          {text}
        </figcaption>
      </figure>
      <p className="-mt-1.5 self-end text-xs text-foreground-muted">
        {t.previewCaption}
      </p>
      {native && (
        <Button onClick={() => void share()} className="w-full text-[22px]">
          <Share2 aria-hidden="true" />
          {t.shareNative}
        </Button>
      )}
      <Button
        variant={native ? "secondary" : "primary"}
        onClick={() => void copy()}
        className="w-full"
      >
        <Copy aria-hidden="true" />
        {t.copy}
      </Button>
      <p
        role="status"
        className="text-center text-[15px] font-bold text-success empty:hidden"
      >
        {copied ? t.copied : ""}
      </p>
    </Sheet>
  );
}
