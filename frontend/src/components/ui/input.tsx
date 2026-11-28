import * as React from "react";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-border-strong bg-surface px-4 text-base transition-colors outline-none placeholder:text-foreground-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-2 aria-invalid:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
