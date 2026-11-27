import type { QuestionType } from "@/features/play/api";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-messages";
import type { Locale } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  title: string;
  tagline: string;
  nameLabel: string;
  namePublic: string;
  start: string;
  starting: string;
  loading: string;
  retry: string;
  score: (score: number) => string;
  question: (position: number) => string;
  questions: Record<QuestionType, string>;
  flag: string;
  flagOption: (n: number) => string;
  timeLeft: string;
  seconds: (s: number) => string;
  secondsShort: (s: number) => string;
  correct: string;
  wrong: string;
  timedOut: string;
  tooFast: string;
  correctAnswer: string;
  yourAnswer: string;
  resultTitle: string;
  resultScore: (score: number) => string;
  endReasons: Record<"wrong" | "timeout" | "completed", string>;
  tooFastEnd: string;
  missed: string;
  quizRank: (rank: number) => string;
  globalRank: (rank: number) => string;
  best: (best: number) => string;
  newBest: string;
  playAgain: string;
  quizRanking: string;
  globalRanking: string;
  share: string;
  shareText: (score: number) => string;
  copied: string;
  errors: Record<
    "invalid_name" | "run_not_found" | "not_current_question",
    string
  >;
}>({
  de: {
    title: "What The Flag",
    tagline:
      "Flaggen, Länder und Hauptstädte: Wie viele Fragen schaffst du am Stück?",
    nameLabel: "Dein Name",
    namePublic: "Dein Name erscheint öffentlich in den Ranglisten.",
    start: "Los geht's",
    starting: "Wird gestartet …",
    loading: "Wird geladen …",
    retry: "Erneut versuchen",
    score: (score) => `Punkte: ${score}`,
    question: (position) => `Frage ${position + 1}`,
    questions: {
      flag_name: "Welches Land hat diese Flagge?",
      name_flag: "Welche Flagge hat dieses Land?",
      name_region: "Auf welchem Kontinent liegt dieses Land?",
      name_capital: "Was ist die Hauptstadt dieses Landes?",
      capital_name: "Von welchem Land ist das die Hauptstadt?",
      flag_region: "Auf welchem Kontinent liegt das Land mit dieser Flagge?",
      name_currency: "Welche Währung gilt in diesem Land?",
      flag_capital: "Was ist die Hauptstadt des Landes mit dieser Flagge?",
      capital_flag: "Welche Flagge hat das Land mit dieser Hauptstadt?",
      name_language: "Welche Sprache spricht man in diesem Land?",
      capital_region: "Auf welchem Kontinent liegt diese Hauptstadt?",
      flag_currency: "Welche Währung gilt im Land mit dieser Flagge?",
      flag_language: "Welche Sprache spricht man im Land mit dieser Flagge?",
      capital_currency: "Welche Währung gilt im Land mit dieser Hauptstadt?",
      capital_language:
        "Welche Sprache spricht man im Land mit dieser Hauptstadt?",
    },
    flag: "Flagge",
    flagOption: (n) => `Flagge ${n}`,
    timeLeft: "Verbleibende Zeit",
    seconds: (s) => `${s} Sekunden`,
    secondsShort: (s) => `${s} s`,
    correct: "Richtig!",
    wrong: "Leider falsch.",
    timedOut: "Die Zeit ist abgelaufen.",
    tooFast: "Zu schnell geantwortet.",
    correctAnswer: "richtige Antwort",
    yourAnswer: "deine Antwort",
    resultTitle: "Spiel vorbei",
    resultScore: (score) =>
      score === 1 ? "1 richtige Antwort" : `${score} richtige Antworten`,
    endReasons: {
      wrong: "Die letzte Antwort war falsch.",
      timeout: "Die Zeit für die letzte Frage ist abgelaufen.",
      completed: "Du hast alle Fragen beantwortet.",
    },
    tooFastEnd:
      "Die letzte Antwort kam in weniger als 300 ms und zählt deshalb als falsch.",
    missed: "Diese Frage hat dich erwischt:",
    quizRank: (rank) => `Platz ${rank} in diesem Quiz`,
    globalRank: (rank) => `Platz ${rank} weltweit`,
    best: (best) => `Deine Bestleistung: ${best}`,
    newBest: "Neue Bestleistung!",
    playAgain: "Nochmal spielen",
    quizRanking: "Rangliste dieses Quiz",
    globalRanking: "Globale Rangliste",
    share: "Teilen",
    shareText: (score) =>
      score === 1
        ? "Ich habe 1 Frage über die Welt beantwortet. Schaffst du mehr?"
        : `Ich habe ${score} Fragen über die Welt beantwortet. Schaffst du mehr?`,
    copied: "Link kopiert.",
    errors: {
      invalid_name:
        "Erlaubt sind 1 bis 20 Zeichen mit mindestens einem Buchstaben oder einer Ziffer: Buchstaben, Ziffern, Leerzeichen, _, - und Punkt.",
      run_not_found: "Dieses Spiel gibt es nicht.",
      not_current_question: "Diese Frage ist schon beantwortet.",
    },
  },
  en: {
    title: "What The Flag",
    tagline:
      "Flags, countries and capitals: how many questions can you answer in a row?",
    nameLabel: "Your name",
    namePublic: "Your name appears publicly on the leaderboards.",
    start: "Let's go",
    starting: "Starting …",
    loading: "Loading …",
    retry: "Try again",
    score: (score) => `Score: ${score}`,
    question: (position) => `Question ${position + 1}`,
    questions: {
      flag_name: "Which country has this flag?",
      name_flag: "Which flag does this country have?",
      name_region: "On which continent is this country?",
      name_capital: "What is the capital of this country?",
      capital_name: "Which country has this capital?",
      flag_region: "On which continent is the country with this flag?",
      name_currency: "Which currency is used in this country?",
      flag_capital: "What is the capital of the country with this flag?",
      capital_flag: "Which flag does the country with this capital have?",
      name_language: "Which language is spoken in this country?",
      capital_region: "On which continent is this capital?",
      flag_currency: "Which currency is used in the country with this flag?",
      flag_language: "Which language is spoken in the country with this flag?",
      capital_currency:
        "Which currency is used in the country with this capital?",
      capital_language:
        "Which language is spoken in the country with this capital?",
    },
    flag: "Flag",
    flagOption: (n) => `Flag ${n}`,
    timeLeft: "Time left",
    seconds: (s) => `${s} seconds`,
    secondsShort: (s) => `${s} s`,
    correct: "Correct!",
    wrong: "Sorry, that's wrong.",
    timedOut: "Time is up.",
    tooFast: "Answered too fast.",
    correctAnswer: "correct answer",
    yourAnswer: "your answer",
    resultTitle: "Game over",
    resultScore: (score) =>
      score === 1 ? "1 correct answer" : `${score} correct answers`,
    endReasons: {
      wrong: "The last answer was wrong.",
      timeout: "The time for the last question ran out.",
      completed: "You answered every question.",
    },
    tooFastEnd: "The last answer came within 300 ms, so it counts as wrong.",
    missed: "This question got you:",
    quizRank: (rank) => `Rank ${rank} in this quiz`,
    globalRank: (rank) => `Rank ${rank} worldwide`,
    best: (best) => `Your personal best: ${best}`,
    newBest: "New personal best!",
    playAgain: "Play again",
    quizRanking: "This quiz's leaderboard",
    globalRanking: "Global leaderboard",
    share: "Share",
    shareText: (score) =>
      score === 1
        ? "I answered 1 question about the world. Can you beat it?"
        : `I answered ${score} questions about the world. Can you beat it?`,
    copied: "Link copied.",
    errors: {
      invalid_name:
        "Use 1 to 20 characters with at least one letter or digit: letters, digits, spaces, _, - and full stops.",
      run_not_found: "This game does not exist.",
      not_current_question: "This question is already answered.",
    },
  },
});

type ErrorCode = keyof (typeof messages)["de"]["errors"];

function isErrorCode(code: string): code is ErrorCode {
  return Object.hasOwn(messages.de.errors, code);
}

/** The text for an error: this feature's codes first, then the generic ones. */
export function playError(err: unknown, locale: Locale): string {
  if (err instanceof ApiError && isErrorCode(err.code)) {
    return messages[locale].errors[err.code];
  }
  return errorMessage(err, locale);
}
