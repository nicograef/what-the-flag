import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ownRunState } from "@/features/leaderboard/own-run";
import { fakeRun, sampleQuestions } from "@/features/play/fake-run";
import { FakeApi, type Json } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

const quizId = "00000000-0000-4000-8000-0000000000aa";
const ownRun = "00000000-0000-4000-8000-0000000000bb";

function challenge(creator: Json, top: Json[] = []): Json {
  return { id: quizId, creator, top };
}

it.each([
  {
    creator: { name: "Ada", score: 7, ended: true },
    text: "Ada hat 7 Fragen geschafft. Schaffst du mehr?",
    form: true,
  },
  {
    creator: { name: "Ada", score: 2, ended: false },
    text: "Ada spielt noch.",
    form: false,
  },
])("shows the creator: $text", async ({ creator, text, form }) => {
  const api = new FakeApi().respond(
    `GET /api/quizzes/${quizId}`,
    challenge(creator),
  );

  renderRoute(`/q/${quizId}`, { api });

  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(screen.queryByLabelText("Dein Name") !== null).toBe(form);
});

it("highlights the requester's own row in the quiz ranking", async () => {
  const api = new FakeApi().respond(
    `GET /api/quizzes/${quizId}?run=${ownRun}`,
    challenge({ name: "Ada", score: 3, ended: true }, [
      { rank: 1, name: "Ada", score: 3 },
      { rank: 2, name: "Bea", score: 1, own: true },
      { rank: 2, name: "Cem", score: 1 },
    ]),
  );

  renderRoute(`/q/${quizId}`, { api, state: ownRunState(ownRun) });

  const table = await screen.findByRole("table", {
    name: "Rangliste dieses Quiz",
  });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows.map((r) => r.textContent)).toEqual([
    "1Ada3",
    "2Bea(du)1",
    "2Cem1",
  ]);
  expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([
    null,
    "true",
    null,
  ]);
});

it("starts a run on this quiz from the name form", async () => {
  const api = new FakeApi().respond(
    `GET /api/quizzes/${quizId}`,
    challenge({ name: "Ada", score: 3, ended: true }),
  );
  fakeRun(api, sampleQuestions);
  const { user } = renderRoute(`/q/${quizId}`, { api });

  await user.type(await screen.findByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
  const start = api.calls.find((c) => c.route === "POST /api/runs");
  expect(start?.body).toEqual({ name: "Bea", quizId });
});

it("shows quiz_in_progress when the start is refused", async () => {
  const api = new FakeApi()
    .respond(
      `GET /api/quizzes/${quizId}`,
      challenge({ name: "Ada", score: 3, ended: true }),
    )
    .fail("POST /api/runs", 409, "quiz_in_progress");
  const { user } = renderRoute(`/q/${quizId}`, { api });

  await user.type(await screen.findByLabelText("Dein Name"), "Bea");
  await user.click(screen.getByRole("button", { name: "Los geht's" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Das Quiz läuft noch. Du kannst spielen, sobald die erste Runde vorbei ist.",
  );
});

it("shows quiz_not_found for an unknown quiz", async () => {
  const api = new FakeApi().fail(
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
