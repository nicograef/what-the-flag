import type { ReactNode } from "react";

function EmptyState({
  icon,
  children,
}: {
  icon: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
      <div
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-foreground-muted [&_svg]:size-8"
      >
        {icon}
      </div>
      {children}
    </div>
  );
}

export { EmptyState };
