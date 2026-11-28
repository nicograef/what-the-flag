import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import {
  fakeRun,
  sampleQuestions,
  unknownPlayer,
} from "@/features/play/fake-run";
import { FakeApi } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

function server(): FakeApi {
  return new FakeApi().respond("GET /api/me", unknownPlayer);
}

const returning = {
  lastName: "Ada",
  best: 24,
  worldRank: 38,
  worldBest: 24,
  lastQuizId: "00000000-0000-4000-8000-0000000000aa",
};

async function expectFirstVisit(): Promise<void> {
  expect(
    await screen.findByRole("heading", { name: "Wie weit kommst du?" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "115 Sekunden pro Frage",
    "2Alle 5 Fragen ein Level schwerer, bis Level 10",
    "3Ein Fehler und es ist vorbei",
  ]);
  expect(screen.getByLabelText("Dein Name")).toHaveAccessibleDescription(
    "Erscheint öffentlich in der Rangliste.",
  );
  expect(screen.queryByText("Dein Rekord")).not.toBeInTheDocument();
}

it("shows the first-visit layout for an unknown player", async () => {
  const api = server();
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await expectFirstVisit();

  await user.type(screen.getByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Starten" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
  expect(api.calls.map((c) => c.route)).toEqual([
    "GET /api/me",
    "POST /api/runs",
    "GET /api/runs/00000000-0000-4000-8000-000000000002",
  ]);
  expect(api.calls[1]?.body).toEqual({ name: "Bea" });
});

it("shows the first-visit layout when /api/me fails", async () => {
  const api = new FakeApi().fail("GET /api/me", 503, "database_unavailable");
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await expectFirstVisit();

  await user.type(screen.getByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Starten" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
});

it("shows the record and world rank of a returning player", async () => {
  renderRoute("/", { api: new FakeApi().respond("GET /api/me", returning) });

  expect(
    await screen.findByRole("heading", { name: "Dein Rekord" }),
  ).toBeInTheDocument();
  expect(screen.getByText("24")).toBeInTheDocument();
  expect(
    screen.getByText("Dein bester Platz: 38 weltweit"),
  ).toBeInTheDocument();
  expect(screen.getByText("als Ada")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Dein letztes Quiz" }),
  ).toHaveAttribute("href", "/q/00000000-0000-4000-8000-0000000000aa");
  expect(screen.queryByLabelText("Dein Name")).not.toBeInTheDocument();
});

it("starts a returning player's run with one press", async () => {
  const api = new FakeApi().respond("GET /api/me", returning);
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await user.click(await screen.findByRole("button", { name: "Spielen" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
  const start = api.calls.find((c) => c.route === "POST /api/runs");
  expect(start?.body).toEqual({ name: "Ada" });
});

it("swaps the name line for the field on Change name", async () => {
  const api = new FakeApi().respond("GET /api/me", returning);
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await user.click(await screen.findByRole("button", { name: "Name ändern" }));
  const field = screen.getByLabelText("Dein Name");
  expect(field).toHaveFocus();
  expect(field).toHaveValue("Ada");
  await user.clear(field);
  await user.type(field, "Ben");
  await user.click(screen.getByRole("button", { name: "Spielen" }));

  await screen.findByRole("heading", {
    name: "Welches Land hat diese Flagge?",
  });
  const start = api.calls.find((c) => c.route === "POST /api/runs");
  expect(start?.body).toEqual({ name: "Ben" });
});

it.each([
  {
    code: "invalid_name",
    status: 400,
    field: "name",
    text: "Erlaubt sind 1 bis 20 Zeichen mit mindestens einem Buchstaben oder einer Ziffer: Buchstaben, Ziffern, Leerzeichen, _, - und Punkt.",
    invalid: "true",
  },
  {
    code: "rate_limited",
    status: 429,
    field: undefined,
    text: "Zu viele Anfragen auf einmal. Warte kurz und versuch es noch einmal.",
    invalid: "false",
  },
])("shows $code", async ({ code, status, field, text, invalid }) => {
  const api = server().fail("POST /api/runs", status, code, field);
  const { user } = renderRoute("/", { api });
  const input = await screen.findByLabelText("Dein Name");

  await user.type(input, "Bea");
  await user.click(screen.getByRole("button", { name: "Starten" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(text);
  expect(input).toHaveAttribute("aria-invalid", invalid);
  if (field) expect(input).toHaveAccessibleDescription(new RegExp(`^${text}`));
});

it("shows the not-found page on an unknown path", async () => {
  renderRoute("/nope", { api: new FakeApi() });

  expect(
    await screen.findByText("Diese Seite gibt es nicht."),
  ).toBeInTheDocument();
});

it("shows the credit line on every route but play", async () => {
  const api = server()
    .respond("GET /api/leaderboard", { top: [] })
    .respond("GET /api/quizzes/00000000-0000-4000-8000-0000000000aa", {
      id: "00000000-0000-4000-8000-0000000000aa",
      creator: null,
      top: [],
    });
  const { runId } = fakeRun(api, sampleQuestions);

  for (const path of [
    "/",
    "/leaderboard",
    "/q/00000000-0000-4000-8000-0000000000aa",
    "/nope",
  ]) {
    const { unmount } = renderRoute(path, { api });
    expect(screen.getByRole("link", { name: /Länderdaten/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/NOTICE$/),
    );
    unmount();
  }

  renderRoute(`/play/${runId}`, { api });
  await screen.findByRole("heading", {
    name: "Welches Land hat diese Flagge?",
  });
  expect(
    screen.queryByRole("link", { name: /Länderdaten/ }),
  ).not.toBeInTheDocument();
});

it("switches the language without a request", async () => {
  const api = server();
  const { user } = renderRoute("/", { api });
  await screen.findByLabelText("Dein Name");
  const requests = api.calls.length;

  await user.click(screen.getByRole("button", { name: "English" }));

  expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
  expect(api.calls).toHaveLength(requests);
});
