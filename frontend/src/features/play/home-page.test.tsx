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

it("prefills the name from the server", async () => {
  const api = new FakeApi().respond("GET /api/me", {
    lastName: "Ada",
    best: 4,
    worldRank: 7,
    worldBest: 4,
    lastQuizId: "00000000-0000-4000-8000-0000000000aa",
  });

  renderRoute("/", { api });

  expect(await screen.findByDisplayValue("Ada")).toBe(
    screen.getByLabelText("Dein Name"),
  );
  expect(
    screen.getByText("Dein Name erscheint öffentlich in den Ranglisten."),
  ).toBeInTheDocument();
});

it("starts a run and plays it", async () => {
  const api = server();
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await user.type(screen.getByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

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

it("starts a run while /api/me fails", async () => {
  const api = new FakeApi().fail("GET /api/me", 503, "database_unavailable");
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute("/", { api });

  await user.type(screen.getByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
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
  const input = screen.getByLabelText("Dein Name");

  await user.type(input, "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

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
