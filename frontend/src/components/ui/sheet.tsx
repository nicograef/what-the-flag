import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A bottom sheet on a native `<dialog>` opened with `showModal()`, so the page behind is inert.
 * Escape and the close button close it; focus then returns to the element that opened it.
 */
export function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  /** The close button's accessible name. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    return () => {
      dialog.close();
      trigger.current?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 mx-auto mb-0 w-full max-w-md rounded-t-sheet bg-surface px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-foreground backdrop:bg-[rgb(8_9_22/0.68)] open:motion-safe:animate-rise"
    >
      {open && (
        <div className="flex flex-col gap-3.5">
          <div
            aria-hidden="true"
            className="h-[5px] w-10 self-center rounded-full bg-border"
          />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-[22px] font-extrabold">
              {title}
            </h2>
            <button
              type="button"
              aria-label={closeLabel}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-chip"
              onClick={onClose}
            >
              <X aria-hidden="true" className="size-[22px]" strokeWidth={2.4} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
