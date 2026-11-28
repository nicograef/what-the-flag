import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { buttonClass } from "@/components/ui/button";

/** How long a touch or pen pointer holds before it commits. */
export const holdMs = 400;
/** How far, in px, a held pointer may move outside the element before the hold cancels. */
const slopPx = 12;
/** A click this long after a touch release still belongs to that touch. */
const touchClickMs = 800;

function subscribeMedia(query: string) {
  return (listener: () => void): (() => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", listener);
    return () => list.removeEventListener("change", listener);
  };
}

/** Whether a media query matches, kept current. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
  );
}

/** Whether the primary pointer is coarse: a hold label and the touch hints show then. */
export function useCoarsePointer(): boolean {
  return useMedia("(pointer: coarse)");
}

type Phase = "ready" | "holding" | "committed";

interface HoldOptions {
  /** False while arming, guarded or answered: every activation is ignored. */
  ready: boolean;
  /** Commits at most once; otherwise it is ready again after each commit. */
  once?: boolean;
  onCommit: () => void;
  /** Called when a hold starts and when it ends, committed or not. */
  onHoldChange?: (holding: boolean) => void;
}

interface Hold {
  holding: boolean;
  handlers: Pick<
    ComponentProps<"button">,
    | "onPointerDown"
    | "onPointerMove"
    | "onPointerUp"
    | "onPointerCancel"
    | "onClick"
    | "onContextMenu"
  >;
}

/**
 * Hold to activate. A touch or pen pointer commits 400 ms after `pointerdown` while it stays down
 * and within 12 px of the element. A click no touch preceded, so mouse, Enter, Space and
 * assistive tech, commits at once.
 */
export function useHold({
  ready,
  once = false,
  onCommit,
  onHoldChange,
}: HoldOptions): Hold {
  const [holding, setHolding] = useState(false);
  const phase = useRef<Phase>("ready");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchClick = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const touched = useRef(false);
  const latest = useRef({ ready, once, onCommit, onHoldChange });
  useLayoutEffect(() => {
    latest.current = { ready, once, onCommit, onHoldChange };
  });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(touchClick.current);
    },
    [],
  );

  function commit(): void {
    if (phase.current === "committed" || !latest.current.ready) return;
    phase.current = latest.current.once ? "committed" : "ready";
    if (typeof navigator.vibrate === "function") navigator.vibrate(12);
    latest.current.onCommit();
  }

  function stopHold(): void {
    clearTimeout(timer.current);
    if (phase.current === "holding") phase.current = "ready";
    setHolding(false);
    latest.current.onHoldChange?.(false);
  }

  function cancel(): void {
    if (phase.current !== "holding") return;
    stopHold();
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.pointerType === "mouse") return;
    clearTimeout(touchClick.current);
    touched.current = true;
    if (!latest.current.ready || phase.current !== "ready") return;
    phase.current = "holding";
    setHolding(true);
    latest.current.onHoldChange?.(true);
    timer.current = setTimeout(() => {
      if (phase.current !== "holding") return;
      commit();
      setHolding(false);
      latest.current.onHoldChange?.(false);
    }, holdMs);
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>): void {
    if (phase.current !== "holding") return;
    // Touch pointers are captured by the element they went down on, so leaving fires no pointerleave.
    const box = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < box.left - slopPx ||
      event.clientX > box.right + slopPx ||
      event.clientY < box.top - slopPx ||
      event.clientY > box.bottom + slopPx;
    if (outside) cancel();
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>): void {
    if (event.pointerType === "mouse") return;
    cancel();
    touchClick.current = setTimeout(() => {
      touched.current = false;
    }, touchClickMs);
  }

  function pointerCancel(): void {
    touched.current = false;
    cancel();
  }

  function click(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    // The click a touch release fires belongs to the hold, which decided already.
    if (touched.current) {
      touched.current = false;
      return;
    }
    commit();
  }

  return {
    holding,
    handlers: {
      onPointerDown: pointerDown,
      onPointerMove: pointerMove,
      onPointerUp: pointerUp,
      onPointerCancel: pointerCancel,
      onClick: click,
      onContextMenu: (event) => event.preventDefault(),
    },
  };
}

/** The classes that keep a long press from opening a callout, a selection or an image drag. */
export const holdSurface =
  "touch-manipulation select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none";

/** The fill that grows while a hold runs: left to right, or bottom up for a tall flag option. */
export function HoldFill({
  up = false,
  className,
}: {
  up?: boolean;
  className?: string;
}): ReactNode {
  return (
    <span
      data-hold-fill=""
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0",
        up
          ? "origin-bottom animate-hold-fill-up"
          : "origin-left animate-hold-fill",
        className,
      )}
    />
  );
}

/**
 * A primary button that a touch or pen pointer holds for 400 ms; a click, Enter or Space commits
 * at once. Its label names the hold where the primary pointer is coarse.
 */
export function HoldButton({
  label,
  holdLabel,
  guarded = false,
  onCommit,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children" | "type" | "onClick"> & {
  label: string;
  holdLabel: string;
  guarded?: boolean;
  /** Receives the button, so a form's start can call `requestSubmit()`. */
  onCommit: (button: HTMLButtonElement) => void;
}): ReactNode {
  const coarse = useCoarsePointer();
  const ref = useRef<HTMLButtonElement>(null);
  const { holding, handlers } = useHold({
    ready: !guarded,
    onCommit: () => {
      if (ref.current) onCommit(ref.current);
    },
  });
  return (
    <button
      ref={ref}
      type="button"
      data-pressable=""
      aria-disabled={guarded || undefined}
      className={cn(
        buttonClass("primary"),
        holdSurface,
        "overflow-hidden",
        holding && "ring-3 ring-accent ring-inset",
        className,
      )}
      {...handlers}
      {...props}
    >
      {holding && <HoldFill className="bg-accent-edge/60" />}
      <span className="relative">{coarse ? holdLabel : label}</span>
    </button>
  );
}
