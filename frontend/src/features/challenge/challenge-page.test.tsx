import { act, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  fakeRun,
  sampleQuestions,
  unknownPlayer,
} from "@/features/play/fake-run";
import { FakeApi, type Json } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

const quizId = "00000000-0000-4000-8000-0000000000aa";

function server(): FakeApi {
  return new FakeApi().respond("GET /api/me", unknownPlayer);
}

function challenge(creator: Json, top: Json[] = []): Json {
  return { id: quizId, creator, top };
}

const ended = { name: "Ada", score: 7, ended: true, own: false };

it("shows the creator, the target and a slot on the board", async () => {
  const api = server().respond(
    `GET /api/quizzes/${quizId}`,
    challenge(ended, [{ rank: 1, name: "Ada", score: 7 }]),
  );

  renderRoute(`/q/${quizId}`, { api });

  expect(
    await screen.findByRole("heading", { name: "Ada fordert dich heraus" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Genau dieselben Fragen. Schaffst du 8?"),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "1Ada7",
    "?Du",
  ]);
  expect(screen.getByLabelText("Dein Name")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Annehmen" })).not.toHaveAttribute(
    "aria-disabled",
  );
});

it("opens the quiz when the creator run ends", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    let creator: Json = { name: "Ada", score: 2, ended: false, own: false };
    const api = server().respond(`GET /api/quizzes/${quizId}`, () =>
      challenge(creator),
    );
    const { user } = renderRoute(`/q/${quizId}`, { api });

    expect(
      await screen.findByRole("heading", { name: "Ada spielt gerade" }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Trag schon mal deinen Namen ein"),
      "Bea",
    );
    expect(
      screen.getByRole("button", { name: "Warte auf Ada …" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("link", { name: "Solange ein eigenes Spiel starten" }),
    ).toHaveAttribute("href", "/");

    creator = { name: "Ada", score: 3, ended: true, own: false };
    await act(() => vi.advanceTimersByTimeAsync(5000));

    expect(
      await screen.findByRole("heading", { name: "Ada fordert dich heraus" }),
    ).toBeInTheDocument();
    const statuses = screen.getAllByRole("status").map((s) => s.textContent);
    expect(statuses).toContain("Das Quiz ist jetzt offen.");
    expect(screen.getByLabelText("Dein Name")).toHaveValue("Bea");
    expect(
      screen.getByRole("button", { name: "Annehmen" }),
    ).not.toHaveAttribute("aria-disabled");
  } finally {
    vi.useRealTimers();
  }
});

it("highlights the requester's own row in the quiz ranking", async () => {
  const api = server().respond(
    `GET /api/quizzes/${quizId}`,
    challenge({ name: "Ada", score: 3, ended: true, own: false }, [
      { rank: 1, name: "Ada", score: 3 },
      { rank: 2, name: "Bea", score: 1, own: true },
      { rank: 2, name: "Cem", score: 1 },
    ]),
  );

  renderRoute(`/q/${quizId}`, { api });

  const board = (await screen.findAllByRole("list"))[0];
  const rows = within(board).getAllByRole("listitem");
  expect(rows.map((r) => r.textContent)).toEqual([
    "1Ada3",
    "2Bea(du)1",
    "2Cem1",
    "?Du",
  ]);
  expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([
    null,
    "true",
    null,
    null,
  ]);
});

it("starts a run on this quiz from the name form", async () => {
  const api = server();
  fakeRun(api, sampleQuestions, { creator: ended });
  const { user } = renderRoute(`/q/${quizId}`, { api });

  await user.type(await screen.findByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Annehmen" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
  const start = api.calls.find((c) => c.route === "POST /api/runs");
  expect(start?.body).toEqual({ name: "Bea", quizId });
});

it("shows a hidden creator's quiz without a head", async () => {
  const api = server().respond(
    `GET /api/quizzes/${quizId}`,
    challenge(null, [{ rank: 1, name: "Ada", score: 3 }]),
  );

  renderRoute(`/q/${quizId}`, { api });

  expect(
    await screen.findByRole("button", { name: "Annehmen" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
    "1Ada3",
    "?Du",
  ]);
});

it("shows the own quiz with a plain play button", async () => {
  const api = new FakeApi();
  fakeRun(api, sampleQuestions, {
    me: { ...unknownPlayer, lastName: "Ada" },
    creator: { name: "Ada", score: 3, ended: true, own: true },
  });
  const { user } = renderRoute(`/q/${quizId}`, { api });

  expect(
    await screen.findByRole("heading", { name: "Dein Quiz" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Du hast 3 geschafft. Gleiche Fragen, neuer Versuch?"),
  ).toBeInTheDocument();
  expect(await screen.findByText("als Ada")).toBeInTheDocument();
  expect(screen.queryByText("Du")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Spielen" }));

  await screen.findByRole("heading", {
    name: "Welches Land hat diese Flagge?",
  });
  const start = api.calls.find((c) => c.route === "POST /api/runs");
  expect(start?.body).toEqual({ name: "Ada", quizId });
});

it("shows quiz_in_progress when the start is refused", async () => {
  const api = server()
    .respond(`GET /api/quizzes/${quizId}`, challenge(ended))
    .fail("POST /api/runs", 409, "quiz_in_progress");
  const { user } = renderRoute(`/q/${quizId}`, { api });

  await user.type(await screen.findByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Annehmen" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Das Quiz läuft noch. Du kannst spielen, sobald die erste Runde vorbei ist.",
  );
});

it("shows quiz_not_found for an unknown quiz", async () => {
  const api = server().fail(
    `GET /api/quizzes/${quizId}`,
    404,
    "quiz_not_found",
  );

  renderRoute(`/q/${quizId}`, { api });

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Dieses Quiz gibt es nicht. Vielleicht ist der Link unvollständig.",
  );
  expect(screen.queryByLabelText("Dein Name")).not.toBeInTheDocument();
});
