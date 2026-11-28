import { genitive } from "@/lib/i18n/locale";
import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  title: string;
  tabWorld: string;
  tabLastQuiz: string;
  subWorld: string;
  subLastQuiz: (name: string) => string;
  subOwnQuiz: string;
  rank: (n: number) => string;
  youSuffix: string;
  pinnedYou: string;
  empty: string;
  loading: string;
  retry: string;
}>({
  de: {
    title: "Rangliste",
    tabWorld: "Weltweit",
    tabLastQuiz: "Letztes Quiz",
    subWorld: "Bestes eigenes Spiel je Spieler, aller Zeiten",
    subLastQuiz: (name) => `${genitive(name)} Quiz`,
    subOwnQuiz: "Dein Quiz",
    rank: (n) => `Platz ${n}`,
    youSuffix: "(du)",
    pinnedYou: "Du",
    empty: "Noch niemand auf der Liste. Spiel eine Runde und steh ganz oben.",
    loading: "Wird geladen …",
    retry: "Erneut versuchen",
  },
  en: {
    title: "Leaderboard",
    tabWorld: "World",
    tabLastQuiz: "Latest quiz",
    subWorld: "Each player's best own game, all time",
    subLastQuiz: (name) => `${name}'s quiz`,
    subOwnQuiz: "Your quiz",
    rank: (n) => `Rank ${n}`,
    youSuffix: "(you)",
    pinnedYou: "You",
    empty:
      "Nobody is on the leaderboard yet. Start a quiz and take the top spot.",
    loading: "Loading …",
    retry: "Try again",
  },
});
