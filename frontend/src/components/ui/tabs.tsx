import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "cn";

export interface Tab<T extends string> {
  id: T;
  label: string;
}

/**
 * A 44 px segmented control over one tab panel. Arrow keys, Home and End move the selection and
 * the focus, so only the selected tab is in the tab order.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
}: {
  /** The tab list's accessible name. */
  label: string;
  tabs: Tab<T>[];
  selected: T;
  onSelect: (id: T) => void;
  /** The selected tab's panel. */
  children: ReactNode;
}): ReactNode {
  const base = useId();
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const tabId = (id: T): string => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;

  function keyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const at = tabs.findIndex((tab) => tab.id === selected);
    const next = {
      ArrowRight: (at + 1) % tabs.length,
      ArrowLeft: (at - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const id = tabs[next].id;
    onSelect(id);
    refs.current.get(id)?.focus();
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={keyDown}
        className="flex gap-1 rounded-option bg-surface p-1"
      >
        {tabs.map((tab) => {
          const active = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el);
                else refs.current.delete(tab.id);
              }}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "min-h-11 flex-1 rounded-chip px-3 text-base",
                active
                  ? "bg-surface-2 font-extrabold shadow-[inset_0_-3px_0_var(--color-accent)]"
                  : "font-semibold text-foreground-muted",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        className="flex flex-col"
      >
        {children}
      </div>
    </>
  );
}
