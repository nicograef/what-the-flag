import { afterEach, expect, it, vi } from "vitest";
import { detectLocale } from "@/lib/i18n/locale";

afterEach(() => {
  vi.restoreAllMocks();
});

it.each([
  { name: "stored value wins", stored: "en", language: "de-DE", want: "en" },
  { name: "de-AT is German", stored: null, language: "de-AT", want: "de" },
  {
    name: "fr falls back to English",
    stored: null,
    language: "fr",
    want: "en",
  },
])("detectLocale: $name", ({ stored, language, want }) => {
  if (stored) localStorage.setItem("wtf.locale", stored);
  vi.spyOn(navigator, "language", "get").mockReturnValue(language);

  expect(detectLocale()).toBe(want);
});
