import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  title: string;
  intro: string;
  rank: string;
  name: string;
  score: string;
  youSuffix: string;
  empty: string;
  loading: string;
  retry: string;
}>({
  de: {
    title: "Rangliste",
    intro:
      "Die 100 besten Runden. Wer über einen geteilten Link spielt, landet in der Rangliste dieses Quiz.",
    rank: "Platz",
    name: "Name",
    score: "Punkte",
    youSuffix: "(du)",
    empty: "Noch niemand auf der Liste. Spiel eine Runde und steh ganz oben.",
    loading: "Wird geladen …",
    retry: "Erneut versuchen",
  },
  en: {
    title: "Leaderboard",
    intro:
      "The 100 best runs. Runs from a shared link count on that quiz's leaderboard.",
    rank: "Rank",
    name: "Name",
    score: "Score",
    youSuffix: "(you)",
    empty:
      "Nobody is on the leaderboard yet. Start a quiz and take the top spot.",
    loading: "Loading …",
    retry: "Try again",
  },
});
