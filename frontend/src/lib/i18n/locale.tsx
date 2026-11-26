import { useEffect, useSyncExternalStore, type ReactNode } from "react";

export type Locale = "de" | "en";

const storageKey = "wtf.locale";

let current: Locale | null = null;
const listeners = new Set<() => void>();

function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

function readStored(): Locale | null {
  try {
    const value = localStorage.getItem(storageKey);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** The stored choice, else German for a German browser, else English. */
export function detectLocale(): Locale {
  const stored = readStored();
  if (stored) return stored;
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

export function getLocale(): Locale {
  current ??= detectLocale();
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
  for (const listener of listeners) listener();
}

/** Forgets the in-memory choice, so the next read detects again. Test setup only. */
export function resetLocaleStore(): void {
  current = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const locale = useSyncExternalStore(subscribe, getLocale);
  return { locale, setLocale };
}

export function LocaleProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const { locale } = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return children;
}
