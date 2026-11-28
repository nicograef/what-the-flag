import { ApiError } from "@/lib/api";
import { playError } from "@/features/play/messages";
import { errorMessage } from "@/lib/i18n/error-messages";
import type { Locale } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  challengedBy: (name: string) => string;
  target: (n: number) => string;
  you: string;
  waitingTitle: (name: string) => string;
  waitingBody: (name: string) => string;
  waitingName: string;
  waitingButton: (name: string) => string;
  waitingOwnGame: string;
  unlocked: string;
  ownQuizTitle: string;
  ownQuizBody: (n: number) => string;
  loading: string;
  home: string;
  retry: string;
  errors: Record<"quiz_not_found" | "quiz_in_progress", string>;
}>({
  de: {
    challengedBy: (name) => `${name} fordert dich heraus`,
    target: (n) => `Genau dieselben Fragen. Schaffst du ${n}?`,
    you: "Du",
    waitingTitle: (name) => `${name} spielt gerade`,
    waitingBody: (name) =>
      `Sobald ${name} fertig ist, siehst du das Ergebnis hier und kannst sofort loslegen. Die Seite aktualisiert sich von selbst.`,
    waitingName: "Trag schon mal deinen Namen ein",
    waitingButton: (name) => `Warte auf ${name} …`,
    waitingOwnGame: "Solange ein eigenes Spiel starten",
    unlocked: "Das Quiz ist jetzt offen.",
    ownQuizTitle: "Dein Quiz",
    ownQuizBody: (n) =>
      `Du hast ${n} geschafft. Gleiche Fragen, neuer Versuch?`,
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
    challengedBy: (name) => `${name} challenges you`,
    target: (n) => `Exactly the same questions. Can you get ${n}?`,
    you: "You",
    waitingTitle: (name) => `${name} is still playing`,
    waitingBody: (name) =>
      `As soon as ${name} finishes, you'll see the score here and can start right away. This page updates by itself.`,
    waitingName: "Enter your name while you wait",
    waitingButton: (name) => `Waiting for ${name} …`,
    waitingOwnGame: "Start your own game meanwhile",
    unlocked: "The quiz is open now.",
    ownQuizTitle: "Your quiz",
    ownQuizBody: (n) => `You got ${n}. Same questions, another go?`,
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
