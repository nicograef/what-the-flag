import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-messages";
import type { Locale } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  title: string;
  creatorScore: (name: string, score: number) => string;
  stillPlaying: (name: string) => string;
  play: string;
  ranking: string;
  loading: string;
  home: string;
  errors: Record<"quiz_not_found", string>;
}>({
  de: {
    title: "Herausforderung",
    creatorScore: (name, score) =>
      score === 1
        ? `${name} hat 1 Frage geschafft. Schaffst du mehr?`
        : `${name} hat ${score} Fragen geschafft. Schaffst du mehr?`,
    stillPlaying: (name) => `${name} spielt noch.`,
    play: "Spiel dieses Quiz",
    ranking: "Rangliste dieses Quiz",
    loading: "Wird geladen …",
    home: "Zur Startseite",
    errors: {
      quiz_not_found:
        "Dieses Quiz gibt es nicht. Vielleicht ist der Link unvollständig.",
    },
  },
  en: {
    title: "Challenge",
    creatorScore: (name, score) =>
      score === 1
        ? `${name} answered 1 question. Can you beat it?`
        : `${name} answered ${score} questions. Can you beat it?`,
    stillPlaying: (name) => `${name} is still playing.`,
    play: "Play this quiz",
    ranking: "This quiz's leaderboard",
    loading: "Loading …",
    home: "Back to the start page",
    errors: {
      quiz_not_found: "This quiz does not exist. The link may be incomplete.",
    },
  },
});

type ErrorCode = keyof (typeof messages)["de"]["errors"];

function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(messages.de.errors, code);
}

/** The text for an error: this feature's codes first, then the generic ones. */
export function challengeError(err: unknown, locale: Locale): string {
  if (err instanceof ApiError && isErrorCode(err.code)) {
    return messages[locale].errors[err.code];
  }
  return errorMessage(err, locale);
}
