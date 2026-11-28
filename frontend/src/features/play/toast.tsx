import { Star } from "lucide-react";
import type { ReactNode } from "react";

/** A gold pill that scales in; its text also goes to the outcome status region. */
export function Toast({
  title,
  body,
}: {
  title: string;
  body?: string;
}): ReactNode {
  return (
    <div
      data-motion=""
      className="flex flex-col items-center rounded-3xl bg-accent px-6 py-3 text-accent-ink shadow-[0_16px_50px_rgb(255_201_60/0.35)] motion-safe:animate-toast"
    >
      <strong className="flex items-center gap-2 text-[26px] leading-tight font-extrabold">
        <Star aria-hidden="true" className="size-6" strokeWidth={2.4} />
        {title}
      </strong>
      {body && <span className="text-base font-semibold">{body}</span>}
    </div>
  );
}
