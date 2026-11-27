import { ApiError } from "@/lib/api";
import { playError } from "@/features/play/messages";
import { errorMessage } from "@/lib/i18n/error-messages";
import type { Locale } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  title: string;
  creatorScore: (name: string, score: number) => string;
  scoreLabel: (score: number) => string;
  beatIt: string;
  stillPlaying: (name: string) => string;
  autoRefresh: string;
  ranking: string;
  loading: string;
  home: string;
  retry: string;
  errors: Record<"quiz_not_found" | "quiz_in_progress", string>;
}>({
  de: {
    title: "Herausforderung",
    creatorScore: (name, score) =>
      score === 1
        ? `${name} hat 1 Frage richtig beantwortet. Schaffst du mehr?`
        : `${name} hat ${score} Fragen richtig beantwortet. Schaffst du mehr?`,
    scoreLabel: (score) =>
      score === 1 ? "richtige Antwort" : "richtige Antworten",
    beatIt: "Schaffst du mehr?",
    stillPlaying: (name) => `${name} spielt noch.`,
    autoRefresh: "Die Seite aktualisiert sich von selbst.",
    ranking: "Rangliste dieses Quiz",
    loading: "Wird geladen …",
    home: "Zur Startseite",
    retry: "Erneut versuchen",
    errors: {
      quiz_not_found:
        "Dieses Quiz gibt es nicht. Vielleicht ist der Link unvollständig.",
      quiz_in_progress:
        "Das Quiz läuft noch. Du kannst spielen, sobald die erste Runde vorbei ist.",
    },
  },
  en: {
    title: "Challenge",
    creatorScore: (name, score) =>
      score === 1
        ? `${name} got 1 question right. Can you beat it?`
        : `${name} got ${score} questions right. Can you beat it?`,
    scoreLabel: (score) => (score === 1 ? "correct answer" : "correct answers"),
    beatIt: "Can you beat it?",
    stillPlaying: (name) => `${name} is still playing.`,
    autoRefresh: "This page updates by itself.",
    ranking: "This quiz's leaderboard",
    loading: "Loading …",
    home: "Back to home",
    retry: "Try again",
    errors: {
      quiz_not_found: "This quiz does not exist. The link may be incomplete.",
      quiz_in_progress:
        "This quiz is still being played. You can play once the first run has ended.",
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

/** The text for a failed start on this quiz: this feature's codes first, then the play feature's. */
export function startError(err: unknown, locale: Locale): string {
  if (err instanceof ApiError && isErrorCode(err.code)) {
    return messages[locale].errors[err.code];
  }
  return playError(err, locale);
}
