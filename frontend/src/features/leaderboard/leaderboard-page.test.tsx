import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { unknownPlayer } from "@/features/play/fake-run";
import { FakeApi, type Json } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

const quizId = "00000000-0000-4000-8000-0000000000aa";

function server(top: Json[], me: Json = unknownPlayer): FakeApi {
  return new FakeApi()
    .respond("GET /api/me", me)
    .respond("GET /api/leaderboard", { top });
}

async function entries(): Promise<HTMLElement[]> {
  const panel = await screen.findByRole("tabpanel");
  return within(panel).findAllByRole("listitem");
}

it("shows the global list on a podium, then in rows", async () => {
  renderRoute("/leaderboard", {
    api: server([
      { rank: 1, name: "Ada", score: 12 },
      { rank: 1, name: "Bea", score: 12 },
      { rank: 3, name: "Cem", score: 9 },
      { rank: 4, name: "Ada", score: 4 },
    ]),
  });

  const shown = await entries();
  expect(shown.map((r) => r.textContent)).toEqual([
    "Ada12Platz 1",
    "Bea12Platz 1",
    "Cem9Platz 3",
    "4Ada4",
  ]);
  expect(shown.some((r) => r.hasAttribute("aria-current"))).toBe(false);
  expect(
    screen.getByText("Bestes eigenes Spiel je Spieler, aller Zeiten"),
  ).toBeInTheDocument();
});

it("highlights the own row the server marks", async () => {
  renderRoute("/leaderboard", {
    api: server([
      { rank: 1, name: "Ada", score: 12 },
      { rank: 2, name: "Bea", score: 9 },
      { rank: 3, name: "Cem", score: 8 },
      { rank: 4, name: "Dan", score: 5, own: true },
    ]),
  });

  const shown = await entries();
  expect(shown.map((r) => r.getAttribute("aria-current"))).toEqual([
    null,
    null,
    null,
    "true",
  ]);
  expect(shown[3]).toHaveTextContent("4Dan(du)5");
});

it("pins the own row from /api/me when it is outside the list", async () => {
  renderRoute("/leaderboard", {
    api: server([{ rank: 1, name: "Ada", score: 12 }], {
      lastName: "Kim",
      best: 3,
      worldRank: 150,
      worldBest: 3,
      lastQuizId: null,
    }),
  });

  const pinned = await screen.findByText("Du");
  expect(pinned.parentElement).toHaveAttribute("aria-current", "true");
  expect(pinned.parentElement).toHaveTextContent("150Du3Spielen");
  expect(screen.getByRole("button", { name: "Spielen" })).toBeInTheDocument();
});

it("hints at an empty list", async () => {
  renderRoute("/leaderboard", { api: server([]) });

  expect(
    await screen.findByText(
      "Noch niemand auf der Liste. Spiel eine Runde und steh ganz oben.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
});

it("shows the latest quiz in its own tab", async () => {
  const api = server([{ rank: 1, name: "Ada", score: 12 }], {
    ...unknownPlayer,
    lastName: "Kim",
    lastQuizId: quizId,
  }).respond(`GET /api/quizzes/${quizId}`, {
    id: quizId,
    creator: { name: "Jonas", score: 6, ended: true, own: false },
    top: [
      { rank: 1, name: "Jonas", score: 6 },
      { rank: 2, name: "Kim", score: 4, own: true },
    ],
  });
  const { user } = renderRoute("/leaderboard", { api });

  await user.click(await screen.findByRole("tab", { name: "Letztes Quiz" }));

  expect(await screen.findByText("Jonas' Quiz")).toBeInTheDocument();
  const shown = await entries();
  expect(shown.map((r) => r.textContent)).toEqual([
    "Jonas6Platz 1",
    "Kim (du)4Platz 2",
  ]);
  expect(shown[1]).toHaveAttribute("aria-current", "true");
  expect(screen.queryByText("Du")).not.toBeInTheDocument();
});

it("moves between tabs with the arrow keys", async () => {
  const api = server([], { ...unknownPlayer, lastQuizId: quizId }).respond(
    `GET /api/quizzes/${quizId}`,
    { id: quizId, creator: null, top: [] },
  );
  const { user } = renderRoute("/leaderboard", { api });
  const world = await screen.findByRole("tab", { name: "Weltweit" });
  const quiz = await screen.findByRole("tab", { name: "Letztes Quiz" });
  expect(world).toHaveAttribute("aria-selected", "true");
  expect(quiz).toHaveAttribute("tabindex", "-1");

  world.focus();
  await user.keyboard("{ArrowRight}");
  expect(quiz).toHaveFocus();
  expect(quiz).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Letztes Quiz");

  await user.keyboard("{ArrowLeft}");
  expect(world).toHaveFocus();
  expect(world).toHaveAttribute("aria-selected", "true");
});

it("is reached through the header link", async () => {
  const api = server([{ rank: 1, name: "Ada", score: 12 }]);
  const { user } = renderRoute("/", { api });

  await user.click(await screen.findByRole("link", { name: "Rangliste" }));

  expect(
    await screen.findByRole("heading", { name: "Rangliste" }),
  ).toBeInTheDocument();
  expect(await entries()).toHaveLength(1);
  expect(
    screen.queryByRole("link", { name: "Rangliste" }),
  ).not.toBeInTheDocument();
});
