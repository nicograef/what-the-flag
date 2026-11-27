import { HeartCrack, Timer, TrendingUp, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { messages } from "@/features/play/messages";
import { useMessages } from "@/lib/i18n/messages";

const chips: [keyof (typeof messages)["de"]["rules"], LucideIcon][] = [
  ["time", Timer],
  ["miss", HeartCrack],
  ["harder", TrendingUp],
];

export function RuleChips(): ReactNode {
  const t = useMessages(messages);

  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {chips.map(([rule, Icon]) => (
        <li
          key={rule}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-medium ring-1 ring-border"
        >
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {t.rules[rule]}
        </li>
      ))}
    </ul>
  );
}
