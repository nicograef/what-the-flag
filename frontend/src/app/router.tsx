import { createBrowserRouter, type RouteObject } from "react-router";
import { Layout } from "@/app/layout";
import { NotFoundPage } from "@/features/landing/not-found-page";
import { HomePage } from "@/features/play/home-page";
import { PlayPage } from "@/features/play/play-page";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "play/:runId", element: <PlayPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
