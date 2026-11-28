import { screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { fakeRun, sampleQuestions } from "@/features/play/fake-run";
import { FakeApi } from "@/test/fake-api";
import { renderRoute } from "@/test/render";

afterEach(() => {
  vi.restoreAllMocks();
});

const slow = { timeout: 2000 };

function answers(api: FakeApi): unknown[] {
  return api.calls
    .filter((c) => c.route.endsWith("/answers"))
    .map((c) => c.body);
}

/** Pins `performance.now()`; the returned setter moves it. */
function clock(start = 0): (ms: number) => void {
  let now = start;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return (ms) => {
    now = ms;
  };
}

async function startPlaying(
  options?: Parameters<typeof fakeRun>[2],
): Promise<
  { api: FakeApi; ids: ReturnType<typeof fakeRun> } & ReturnType<
    typeof renderRoute
  >
> {
  const api = new FakeApi();
  const ids = fakeRun(api, sampleQuestions, options);
  const rendered = renderRoute(`/play/${ids.runId}`, { api });
  await screen.findByRole("heading", {
    name: "Welches Land hat diese Flagge?",
  });
  return { api, ids, ...rendered };
}

it("reveals a correct answer, then shows the next question", async () => {
  const { api, user } = await startPlaying();

  await user.click(screen.getByRole("button", { name: "Deutschland" }));

  expect(await screen.findByText("Richtig!")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Deutschland\s*, richtige Antwort$/ }),
  ).toBeDisabled();
  expect(
    await screen.findByRole(
      "heading",
      { name: "Was ist die Hauptstadt dieses Landes?" },
      slow,
    ),
  ).toHaveFocus();
  expect(screen.getByText("Punkte: 1")).toBeInTheDocument();
  // The timer and the card share a position; equal sibling keys left old timers mounted.
  expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
});

it("keeps the question under a failed refetch and retries it", async () => {
  const { api, ids, user } = await startPlaying();
  api.fail(`GET /api/runs/${ids.runId}`, 503, "database_unavailable");

  await user.click(screen.getByRole("button", { name: "Deutschland" }));

  expect(await screen.findByRole("alert", {}, slow)).toHaveTextContent(
    "Die Datenbank ist gerade nicht erreichbar.",
  );
  expect(
    screen.getByRole("heading", { name: "Welches Land hat diese Flagge?" }),
  ).toBeInTheDocument();
  const reads = api.calls.length;

  await user.click(screen.getByRole("button", { name: "Erneut versuchen" }));

  await waitFor(() => {
    expect(api.calls.slice(reads).map((c) => c.route)).toContain(
      `GET /api/runs/${ids.runId}`,
    );
  });
});

it("drops a not-current-question error once the next question shows", async () => {
  const { api, ids, user } = await startPlaying();
  const answersRoute = `/api/runs/${ids.runId}/answers`;
  // Another tab answers first.
  await api.fetch(answersRoute, {
    method: "POST",
    body: JSON.stringify({ position: 0, option: 1 }),
  });
  api.fail(`POST ${answersRoute}`, 409, "not_current_question");

  await user.click(screen.getByRole("button", { name: "Deutschland" }));

  await screen.findByRole("heading", {
    name: "Was ist die Hauptstadt dieses Landes?",
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows the missed question and both ranks after a wrong answer", async () => {
  const { ids, user } = await startPlaying({ quizRank: 3, globalRank: 12 });

  await user.click(screen.getByRole("button", { name: "Frankreich" }));

  expect(await screen.findByText("Leider falsch.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Deutschland\s*, richtige Antwort$/ }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /^Frankreich\s*, deine Antwort$/ }),
  ).toBeDisabled();
  expect(
    await screen.findByRole("heading", { name: "Spiel vorbei" }, slow),
  ).toHaveFocus();
  expect(screen.getByText("0 richtige Antworten")).toBeInTheDocument();
  expect(
    screen.getByText("Die letzte Antwort war falsch."),
  ).toBeInTheDocument();
  expect(screen.getByText("Platz 3 in diesem Quiz")).toBeInTheDocument();
  expect(screen.getByText("Platz 12 weltweit")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Rangliste dieses Quiz" }),
  ).toHaveAttribute("href", `/q/${ids.quizId}`);
  expect(
    screen.getByRole("link", { name: "Globale Rangliste" }),
  ).toHaveAttribute("href", "/leaderboard");
  expect(screen.getByText("Deutschland").parentElement).toHaveTextContent(
    "Deutschland, richtige Antwort",
  );
  expect(screen.getByText("Frankreich").parentElement).toHaveTextContent(
    "Frankreich, deine Antwort",
  );
});

it("names a correct pick within the minimum answer time as too fast", async () => {
  const { user } = await startPlaying({ tooFast: true });

  await user.click(screen.getByRole("button", { name: "Deutschland" }));

  expect(
    await screen.findByText(
      "Die letzte Antwort kam in weniger als 300 ms und zählt deshalb als falsch.",
      {},
      slow,
    ),
  ).toBeInTheDocument();
});

it("answers nothing when the time runs out", async () => {
  const setNow = clock();
  const { api } = await startPlaying();

  setNow(15_000);

  await waitFor(() => {
    expect(answers(api)).toEqual([{ position: 0, option: null }]);
  });
  expect(
    await screen.findByText(
      "Die Zeit für die letzte Frage ist abgelaufen.",
      {},
      slow,
    ),
  ).toBeInTheDocument();
});

it("resumes with the served question and its running deadline", async () => {
  const setNow = clock(1_000);
  await startPlaying({ remainingMs: 5_000 });

  expect(screen.getByText("5 s")).toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: "Verbleibende Zeit" }),
  ).toHaveAttribute("aria-valuetext", "5 Sekunden");

  setNow(3_000);

  expect(await screen.findByText("3 s")).toBeInTheDocument();
});

it("stores and announces a new personal best", async () => {
  const { user } = await startPlaying();

  await user.click(screen.getByRole("button", { name: "Deutschland" }));
  await screen.findByRole(
    "heading",
    { name: "Was ist die Hauptstadt dieses Landes?" },
    slow,
  );
  await user.click(screen.getByRole("button", { name: "Kyoto" }));

  expect(
    await screen.findByText("Neue Bestleistung!", {}, slow),
  ).toBeInTheDocument();
  expect(screen.getByText("Deine Bestleistung: 1")).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("wtf.best") ?? "null")).toMatchObject({
    score: 1,
  });
});

it("plays again under the same name on a fresh quiz", async () => {
  const { api, user } = await startPlaying({ name: "Bea" });
  await user.click(screen.getByRole("button", { name: "Frankreich" }));

  await user.click(
    await screen.findByRole("button", { name: "Nochmal spielen" }, slow),
  );

  expect(
    await screen.findByRole("heading", {
      name: "Welches Land hat diese Flagge?",
    }),
  ).toBeInTheDocument();
  const starts = api.calls.filter((c) => c.route === "POST /api/runs");
  expect(starts.map((c) => c.body)).toEqual([{ name: "Bea" }]);
  expect(api.calls.at(-1)?.route).toBe(
    "GET /api/runs/00000000-0000-4000-8000-000000000002",
  );
});

it("shares the challenge link through the share sheet", async () => {
  const share = vi.fn<(data: ShareData) => Promise<void>>();
  share.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
  try {
    const { ids, user } = await startPlaying();
    await user.click(screen.getByRole("button", { name: "Frankreich" }));

    await user.click(
      await screen.findByRole("button", { name: "Teilen" }, slow),
    );

    expect(share).toHaveBeenCalledWith({
      text: "Ich habe bei What The Flag 0 Fragen in Folge richtig beantwortet. Schaffst du mehr?",
      url: `${window.location.origin}/q/${ids.quizId}`,
    });
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
});

it("copies the challenge link without a share sheet", async () => {
  const { ids, user } = await startPlaying();
  const write = vi.spyOn(navigator.clipboard, "writeText");
  await user.click(screen.getByRole("button", { name: "Frankreich" }));

  await user.click(await screen.findByRole("button", { name: "Teilen" }, slow));

  expect(write).toHaveBeenCalledWith(
    `Ich habe bei What The Flag 0 Fragen in Folge richtig beantwortet. Schaffst du mehr? ${window.location.origin}/q/${ids.quizId}`,
  );
  expect(await screen.findByText("Link kopiert.")).toBeInTheDocument();
});

it("switches the language without a request", async () => {
  const { api, user } = await startPlaying();
  const requests = api.calls.length;

  await user.click(screen.getByRole("button", { name: "English" }));

  expect(
    screen.getByRole("heading", { name: "Which country has this flag?" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Germany" })).toBeInTheDocument();
  expect(api.calls).toHaveLength(requests);
});
