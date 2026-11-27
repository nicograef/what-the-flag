import { defineMessages } from "@/lib/i18n/messages";

export const messages = defineMessages<{
  title: string;
  intro: string;
  rank: string;
  name: string;
  score: string;
  you: string;
  empty: string;
  loading: string;
}>({
  de: {
    title: "Rangliste",
    intro: "Die besten 100 Spiele, die ein eigenes Quiz gestartet haben.",
    rank: "Platz",
    name: "Name",
    score: "Punkte",
    you: "du",
    empty: "Noch niemand auf der Liste. Spiel eine Runde und steh ganz oben.",
    loading: "Wird geladen …",
  },
  en: {
    title: "Leaderboard",
    intro: "The top 100 runs that created their quiz.",
    rank: "Rank",
    name: "Name",
    score: "Score",
    you: "you",
    empty:
      "Nobody is on the leaderboard yet. Start a quiz and take the top spot.",
    loading: "Loading …",
  },
});
