import { useLocale, type Locale } from "@/lib/i18n/locale";

/** `NoInfer` makes `en` match the shape inferred from `de`. */
export function defineMessages<T>(m: {
  de: T;
  en: NoInfer<T>;
}): Record<Locale, T> {
  return m;
}

export function useMessages<T>(m: Record<Locale, T>): T {
  return m[useLocale().locale];
}
