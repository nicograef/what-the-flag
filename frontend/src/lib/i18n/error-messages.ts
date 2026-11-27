import { ApiError } from "@/lib/api";
import type { Locale } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

const messages = defineMessages({
  de: {
    invalid_json: "Die Anfrage war fehlerhaft.",
    origin_mismatch: "Die Anfrage kam von einer fremden Seite.",
    not_found: "Das wurde nicht gefunden.",
    body_too_large: "Die Anfrage war zu groß.",
    unsupported_media_type: "Die Anfrage hatte ein falsches Format.",
    internal: "Auf dem Server ist ein Fehler aufgetreten.",
    database_unavailable: "Die Datenbank ist gerade nicht erreichbar.",
    rate_limited:
      "Zu viele Anfragen auf einmal. Warte kurz und versuch es noch einmal.",
    network: "Der Server ist nicht erreichbar. Prüfe deine Verbindung.",
    invalid_response: "Der Server hat unerwartet geantwortet.",
    fallback: "Etwas ist schiefgelaufen.",
  },
  en: {
    invalid_json: "The request was malformed.",
    origin_mismatch: "The request came from a foreign site.",
    not_found: "That was not found.",
    body_too_large: "The request was too large.",
    unsupported_media_type: "The request had the wrong format.",
    internal: "Something went wrong on the server.",
    database_unavailable: "The database is unavailable right now.",
    rate_limited: "Too many requests at once. Wait a moment and try again.",
    network: "The server is unreachable. Check your connection.",
    invalid_response: "The server answered unexpectedly.",
    fallback: "Something went wrong.",
  },
});

type Code = keyof (typeof messages)["de"];

function isCode(code: string): code is Code {
  return Object.hasOwn(messages.de, code);
}

/** The generic text for an error; a feature maps its own codes before calling this. */
export function errorMessage(err: unknown, locale: Locale): string {
  const texts = messages[locale];
  if (err instanceof ApiError && isCode(err.code)) return texts[err.code];
  return texts.fallback;
}
