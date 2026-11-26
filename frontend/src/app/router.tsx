import { createBrowserRouter, type RouteObject } from "react-router";
import { Layout } from "@/app/layout";
import { LandingPage } from "@/features/landing/landing-page";
import { NotFoundPage } from "@/features/landing/not-found-page";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
