import { createBrowserRouter, type RouteObject } from "react-router";
import { Layout } from "@/app/layout";
import { NotFoundPage } from "@/app/not-found-page";
import { ChallengePage } from "@/features/challenge/challenge-page";
import { LeaderboardPage } from "@/features/leaderboard/leaderboard-page";
import { HomePage } from "@/features/play/home-page";
import { PlayPage } from "@/features/play/play-page";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "play/:runId", element: <PlayPage /> },
      { path: "q/:quizId", element: <ChallengePage /> },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
