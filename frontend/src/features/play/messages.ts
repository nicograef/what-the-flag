import type { QuestionType } from "@/features/play/api";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/i18n/error-messages";
import { genitive, type Locale } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  headline: string;
  rule1: string;
  rule2: string;
  rule3: string;
  yourRecord: string;
  worldRankMeta: (rank: number) => string;
  lastQuiz: string;
  play: string;
  nameLabel: string;
  namePublic: string;
  namePlaceholder: string;
  changeName: string;
  playingAs: (name: string) => string;
  holdHintStart: string;
  holdToStart: string;
  start: string;
  holdToAccept: string;
  accept: string;
  answerHow: string;
  loading: string;
  retry: string;
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
  streak: (n: number) => string;
  recordIn: (n: number) => string;
  recordTied: string;
  recordNew: string;
  creatorIn: (name: string, n: number) => string;
  creatorTied: (name: string) => string;
  creatorBeaten: (name: string) => string;
  holdHint: string;
  holding: string;
  revealHint: string;
  resultSoon: string;
  nextSoon: string;
  toastRecord: string;
  toastRecordBody: (n: number) => string;
  toastCreator: (name: string) => string;
  correctAnswer: string;
  yourAnswer: string;
  tooFastEnd: string;
  missed: string;
  headCompleted: string;
  headFirst: string;
  headRecord: string;
  headTied: string;
  headNearMiss: string;
  headTimeout: string;
  headOver: string;
  headBehind: (n: number, name: string) => string;
  wonTitle: (name: string) => string;
  tiedTitle: (name: string) => string;
  scoreLine: string;
  scoreWorldRank: (rank: number) => string;
  scoreBestRank: (rank: number) => string;
  recordLine: (old: number) => string;
  quizRankLine: (rank: number, name: string) => string;
  recordBadge: (old: number) => string;
  recordBadgeFirst: string;
  gapToRecord: (n: number) => string;
  runStripWrong: (n: number) => string;
  runStripTimeout: (n: number) => string;
  runStripCompleted: (n: number) => string;
  challengeNote: string;
  playAgain: string;
  shareRun: (n: number) => string;
  shareRecord: string;
  shareCompleted: string;
  tellCreator: (name: string) => string;
  ownGameWorld: string;
  shareText: (score: number) => string;
  copied: string;
  copiedShort: string;
  errors: Record<
    "invalid_name" | "run_not_found" | "not_current_question",
    string
  >;
}>({
  de: {
    headline: "Wie weit kommst du?",
    rule1: "15 Sekunden pro Frage",
    rule2: "Alle 5 Fragen ein Level schwerer, bis Level 10",
    rule3: "Ein Fehler und es ist vorbei",
    yourRecord: "Dein Rekord",
    worldRankMeta: (rank) => `Dein bester Platz: ${rank} weltweit`,
    lastQuiz: "Dein letztes Quiz",
    play: "Spielen",
    nameLabel: "Dein Name",
    namePublic: "Erscheint öffentlich in der Rangliste.",
    namePlaceholder: "z. B. Kim",
    changeName: "Name ändern",
    playingAs: (name) => `als ${name}`,
    holdHintStart: "So antwortest du auch: halten, bis der Balken voll ist.",
    holdToStart: "Halten zum Starten",
    start: "Starten",
    holdToAccept: "Halten zum Annehmen",
    accept: "Annehmen",
    answerHow: "Auf dem Touchscreen halten, sonst klicken oder Enter drücken.",
    loading: "Wird geladen …",
    retry: "Erneut versuchen",
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
      name_language: "Welche Sprache ist in diesem Land Amtssprache?",
      capital_region: "Auf welchem Kontinent liegt diese Hauptstadt?",
      flag_currency: "Welche Währung gilt im Land mit dieser Flagge?",
      flag_language:
        "Welche Sprache ist im Land mit dieser Flagge Amtssprache?",
      capital_currency: "Welche Währung gilt im Land mit dieser Hauptstadt?",
      capital_language:
        "Welche Sprache ist im Land mit dieser Hauptstadt Amtssprache?",
      regional_language_name: "In welchem Land wird diese Sprache gesprochen?",
    },
    flag: "Flagge",
    flagOption: (n) => `Flagge ${n}`,
    timeLeft: "Verbleibende Zeit",
    seconds: (s) => `${s} Sekunden`,
    secondsShort: (s) => `${s} s`,
    correct: "Richtig!",
    wrong: "Leider falsch",
    timedOut: "Zeit abgelaufen",
    tooFast: "Zu schnell geantwortet.",
    streak: (n) => `${n} richtig`,
    recordIn: (n) => `Rekord in ${n}`,
    recordTied: "Rekord eingestellt",
    recordNew: "Neuer Rekord",
    creatorIn: (name, n) => `${name} in ${n}`,
    creatorTied: (name) => `${name} eingeholt`,
    creatorBeaten: (name) => `${name} geschlagen`,
    holdHint: "Antwort halten, bis der Balken voll ist",
    holding: "Festhalten …",
    revealHint: "Die richtige Antwort trägt einen Haken.",
    resultSoon: "Gleich siehst du dein Ergebnis …",
    nextSoon: "Nächste Frage kommt …",
    toastRecord: "Neuer Rekord!",
    toastRecordBody: (n) => `Du hast deine ${n} geknackt. Weiter so.`,
    toastCreator: (name) => `Du hast ${name} überholt!`,
    correctAnswer: "richtige Antwort",
    yourAnswer: "deine Antwort",
    tooFastEnd:
      "Die letzte Antwort kam in weniger als 300 ms und zählt deshalb als falsch.",
    missed: "Diese Frage hat dich erwischt:",
    headCompleted: "Du hast die Welt durchgespielt",
    headFirst: "Dein erster Rekord!",
    headRecord: "Neuer Rekord!",
    headTied: "Rekord eingestellt!",
    headNearMiss: "So knapp!",
    headTimeout: "Zeit abgelaufen",
    headOver: "Vorbei!",
    headBehind: (n, name) => `Noch ${n}, um ${name} zu schlagen`,
    wonTitle: (name) => `Du hast ${name} geschlagen!`,
    tiedTitle: (name) => `Gleichstand mit ${name}`,
    scoreLine: "richtig in Folge",
    scoreWorldRank: (rank) => ` · Platz ${rank} weltweit`,
    scoreBestRank: (rank) => ` · dein bester Platz: ${rank} weltweit`,
    recordLine: (old) => `vorher ${old}`,
    quizRankLine: (rank, name) => `Platz ${rank} in ${genitive(name)} Quiz`,
    recordBadge: (old) => `Neuer Rekord · vorher ${old}`,
    recordBadgeFirst: "Dein erster Rekord",
    gapToRecord: (n) => `Noch ${n} bis zum neuen Rekord`,
    runStripWrong: (n) => `Dein Lauf: ${n} richtig, dann ein Fehler`,
    runStripTimeout: (n) => `Dein Lauf: ${n} richtig, dann lief die Zeit ab`,
    runStripCompleted: (n) => `Dein Lauf: alle ${n} richtig`,
    challengeNote:
      "Herausforderungen zählen nur in diesem Quiz. Für die Weltrangliste startest du ein eigenes Spiel.",
    playAgain: "Nochmal",
    shareRun: (n) => `Wer schafft mehr als ${n}?`,
    shareRecord: "Rekord teilen",
    shareCompleted: "Das muss jeder wissen",
    tellCreator: (name) => `${name} Bescheid geben`,
    ownGameWorld: "Eigenes Spiel für die Weltrangliste",
    shareText: (score) =>
      score === 1
        ? "Ich habe bei What The Flag 1 Frage richtig beantwortet. Schaffst du mehr?"
        : `Ich habe bei What The Flag ${score} Fragen in Folge richtig beantwortet. Schaffst du mehr?`,
    copied: "Link kopiert.",
    copiedShort: "Kopiert!",
    errors: {
      invalid_name:
        "Erlaubt sind 1 bis 20 Zeichen mit mindestens einem Buchstaben oder einer Ziffer: Buchstaben, Ziffern, Leerzeichen, _, - und Punkt.",
      run_not_found: "Dieses Spiel gibt es nicht.",
      not_current_question: "Diese Frage ist schon beantwortet.",
    },
  },
  en: {
    headline: "How far can you get?",
    rule1: "15 seconds per question",
    rule2: "One level harder every 5 questions, up to level 10",
    rule3: "One miss and it's over",
    yourRecord: "Your record",
    worldRankMeta: (rank) => `Your best rank: ${rank} worldwide`,
    lastQuiz: "Your latest quiz",
    play: "Play",
    nameLabel: "Your name",
    namePublic: "Appears publicly on the leaderboard.",
    namePlaceholder: "e.g. Kim",
    changeName: "Change name",
    playingAs: (name) => `as ${name}`,
    holdHintStart: "That's how you answer too: hold until the bar fills.",
    holdToStart: "Hold to start",
    start: "Start",
    holdToAccept: "Hold to accept",
    accept: "Accept",
    answerHow: "Hold on a touch screen; otherwise click or press Enter.",
    loading: "Loading …",
    retry: "Try again",
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
      name_language: "Which language is official in this country?",
      capital_region: "On which continent is this capital?",
      flag_currency: "Which currency is used in the country with this flag?",
      flag_language:
        "Which language is official in the country with this flag?",
      capital_currency:
        "Which currency is used in the country with this capital?",
      capital_language:
        "Which language is official in the country with this capital?",
      regional_language_name: "In which country is this language spoken?",
    },
    flag: "Flag",
    flagOption: (n) => `Flag ${n}`,
    timeLeft: "Time left",
    seconds: (s) => `${s} seconds`,
    secondsShort: (s) => `${s} s`,
    correct: "Correct!",
    wrong: "Not quite",
    timedOut: "Time's up",
    tooFast: "Answered too fast.",
    streak: (n) => `${n} correct`,
    recordIn: (n) => `Record in ${n}`,
    recordTied: "Record tied",
    recordNew: "New record",
    creatorIn: (name, n) => `${name} in ${n}`,
    creatorTied: (name) => `Level with ${name}`,
    creatorBeaten: (name) => `${name} beaten`,
    holdHint: "Hold your answer until the bar fills",
    holding: "Keep holding …",
    revealHint: "The correct answer has a check mark.",
    resultSoon: "Your result is coming …",
    nextSoon: "Next question …",
    toastRecord: "New record!",
    toastRecordBody: (n) => `You beat your ${n}. Keep going.`,
    toastCreator: (name) => `You passed ${name}!`,
    correctAnswer: "correct answer",
    yourAnswer: "your answer",
    tooFastEnd: "The last answer came within 300 ms, so it counts as wrong.",
    missed: "This question got you:",
    headCompleted: "You've played the whole world",
    headFirst: "Your first record!",
    headRecord: "New record!",
    headTied: "Record tied!",
    headNearMiss: "So close!",
    headTimeout: "Time's up",
    headOver: "Game over",
    headBehind: (n, name) => `${n} more to beat ${name}`,
    wonTitle: (name) => `You beat ${name}!`,
    tiedTitle: (name) => `Tied with ${name}`,
    scoreLine: "in a row",
    scoreWorldRank: (rank) => ` · rank ${rank} worldwide`,
    scoreBestRank: (rank) => ` · your best rank: ${rank} worldwide`,
    recordLine: (old) => `before ${old}`,
    quizRankLine: (rank, name) => `Rank ${rank} in ${name}'s quiz`,
    recordBadge: (old) => `New record · before ${old}`,
    recordBadgeFirst: "Your first record",
    gapToRecord: (n) => `${n} more for a new record`,
    runStripWrong: (n) => `Your run: ${n} correct, then a miss`,
    runStripTimeout: (n) => `Your run: ${n} correct, then time ran out`,
    runStripCompleted: (n) => `Your run: all ${n} correct`,
    challengeNote:
      "Challenges count only in this quiz. Start your own game for the world leaderboard.",
    playAgain: "Play again",
    shareRun: (n) => `Who can beat ${n}?`,
    shareRecord: "Share your record",
    shareCompleted: "Everyone needs to see this",
    tellCreator: (name) => `Tell ${name}`,
    ownGameWorld: "Own game for the world leaderboard",
    shareText: (score) =>
      score === 1
        ? "I got 1 question right on What The Flag. Can you beat it?"
        : `I got ${score} questions right in a row on What The Flag. Can you beat it?`,
    copied: "Link copied.",
    copiedShort: "Copied!",
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
