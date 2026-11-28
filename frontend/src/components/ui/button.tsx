import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cn } from "cn";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary:
    "min-h-[68px] rounded-card border-transparent bg-accent px-5 text-2xl font-extrabold text-accent-ink shadow-[0_6px_0_var(--color-accent-edge)] focus-visible:outline-foreground active:translate-y-[3px] active:shadow-[0_3px_0_var(--color-accent-edge)] aria-disabled:active:translate-y-0 aria-disabled:active:shadow-[0_6px_0_var(--color-accent-edge)]",
  secondary:
    "min-h-14 rounded-card border-border-strong px-4 text-lg font-bold text-foreground active:translate-y-[2px] aria-disabled:active:translate-y-0",
};

/** The classes of a button, for a link that looks like one. */
export function buttonClass(variant: Variant = "primary"): string {
  return cn(
    "relative inline-flex items-center justify-center gap-2 border-2 text-center leading-tight select-none [&_svg]:size-6 [&_svg]:shrink-0",
    "[transition:transform_100ms,box-shadow_100ms,opacity_300ms] motion-reduce:transition-none",
    "aria-disabled:cursor-default aria-disabled:opacity-40",
    variants[variant],
  );
}

/**
 * A `<button>`. A guarded button is `aria-disabled`, ignores activation, keeps its label and
 * fades in, so a late tap from the previous screen does nothing.
 */
export function Button({
  variant = "primary",
  guarded = false,
  className,
  onClick,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant?: Variant;
  guarded?: boolean;
}): ReactNode {
  function click(event: MouseEvent<HTMLButtonElement>): void {
    if (guarded) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      data-pressable=""
      type={type}
      aria-disabled={guarded || undefined}
      className={cn(buttonClass(variant), className)}
      onClick={click}
      {...props}
    />
  );
}
