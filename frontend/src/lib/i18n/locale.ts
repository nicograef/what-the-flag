import { useSyncExternalStore } from "react";
import { readItem, writeItem } from "@/lib/storage";

export type Locale = "de" | "en";

const storageKey = "wtf.locale";

let current: Locale | null = null;
const listeners = new Set<() => void>();

function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

/** The stored choice, else German for a German browser, else English. */
export function detectLocale(): Locale {
  const stored = readItem(storageKey);
  if (isLocale(stored)) return stored;
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

function getLocale(): Locale {
  current ??= detectLocale();
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  writeItem(storageKey, locale);
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

/** The German genitive of a name: an apostrophe after s, ß, x or z ("Jonas'"), else an s ("Nicos"). */
export function genitive(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}'` : `${name}s`;
}
