import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * An inline notice with an icon and at most one action. A warning is a `role=status`, a danger
 * a `role=alert`.
 */
export function Banner({
  tone,
  icon,
  children,
  action,
}: {
  tone: "warning" | "danger";
  icon: ReactNode;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}): ReactNode {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-center gap-2.5 rounded-[14px] border-2 py-2.5 pr-2.5 pl-3.5 [&>svg]:size-[22px] [&>svg]:shrink-0",
        tone === "danger"
          ? "border-danger bg-[#3A1621] [&>svg]:text-[#FF8A96]"
          : "border-warning bg-surface [&>svg]:text-warning",
      )}
    >
      {icon}
      <span className="flex-1 text-[15px] leading-snug">{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 shrink-0 rounded-chip bg-danger px-3 text-[15px] font-extrabold text-danger-ink focus-visible:outline-foreground"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
