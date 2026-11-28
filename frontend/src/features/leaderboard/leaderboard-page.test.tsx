import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { FakeApi } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

async function rows(): Promise<HTMLElement[]> {
  const table = await screen.findByRole("table", { name: "Rangliste" });
  return within(table).getAllByRole("row").slice(1);
}

it("shows the global list", async () => {
  const api = new FakeApi().respond("GET /api/leaderboard", {
    top: [
      { rank: 1, name: "Ada", score: 12 },
      { rank: 1, name: "Bea", score: 12 },
      { rank: 3, name: "Ada", score: 4 },
    ],
  });

  renderRoute("/leaderboard", { api });

  const shown = await rows();
  expect(shown.map((r) => r.textContent)).toEqual([
    "1Ada12",
    "1Bea12",
    "3Ada4",
  ]);
  expect(shown.some((r) => r.hasAttribute("aria-current"))).toBe(false);
});

it("highlights the own row the server marks", async () => {
  const api = new FakeApi().respond("GET /api/leaderboard", {
    top: [
      { rank: 1, name: "Ada", score: 12 },
      { rank: 2, name: "Bea", score: 9, own: true },
    ],
  });

  renderRoute("/leaderboard", { api });

  const shown = await rows();
  expect(shown.map((r) => r.getAttribute("aria-current"))).toEqual([
    null,
    "true",
  ]);
  expect(shown[1]).toHaveTextContent("Bea(du)9");
});

it("hints at an empty list", async () => {
  const api = new FakeApi().respond("GET /api/leaderboard", { top: [] });

  renderRoute("/leaderboard", { api });

  expect(
    await screen.findByText(
      "Noch niemand auf der Liste. Spiel eine Runde und steh ganz oben.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("is reached through the navbar link", async () => {
  const api = new FakeApi().respond("GET /api/leaderboard", {
    top: [{ rank: 1, name: "Ada", score: 12 }],
  });
  const { user } = renderRoute("/", { api });

  await user.click(screen.getByRole("link", { name: "Rangliste" }));

  expect(
    await screen.findByRole("heading", { name: "Rangliste" }),
  ).toBeInTheDocument();
  expect(await rows()).toHaveLength(1);
  expect(api.calls.map((c) => c.route)).toEqual(["GET /api/leaderboard"]);
});
