import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeRun,
  sampleQuestions,
  unknownPlayer,
} from "@/features/play/fake-run";
import { FakeApi } from "@/test/fake-api";
import { answer } from "@/test/answer";
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

  await answer(user, "Deutschland");

  expect(await screen.findByText("Richtig!")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Deutschland\s*, richtige Antwort$/ }),
  ).toHaveAttribute("aria-disabled", "true");
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

  await answer(user, "Deutschland");

  expect(await screen.findByRole("alert", {}, slow)).toHaveTextContent(
    "Die Datenbank ist gerade nicht erreichbar.",
  );
  expect(
    screen.getByRole("heading", { name: "Welches Land hat diese Flagge?" }),
  ).toBeInTheDocument();
  const reads = api.calls.length;

  await answer(user, "Erneut versuchen");

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

  await answer(user, "Deutschland");

  await screen.findByRole("heading", {
    name: "Was ist die Hauptstadt dieses Landes?",
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("shows the missed question and both ranks after a wrong answer", async () => {
  const { ids, user } = await startPlaying({ quizRank: 3, globalRank: 12 });

  await answer(user, "Frankreich");

  expect(await screen.findByText("Leider falsch.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Deutschland\s*, richtige Antwort$/ }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByRole("button", { name: /^Frankreich\s*, deine Antwort$/ }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    await screen.findByRole("heading", { name: "Spiel vorbei" }, slow),
  ).toHaveFocus();
  expect(screen.getByText("0 richtige Antworten")).toBeInTheDocument();
  expect(
    screen.getByText("Die letzte Antwort war falsch."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Dein bester Platz in diesem Quiz: 3"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Dein bester Platz weltweit: 12"),
  ).toBeInTheDocument();
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

  await answer(user, "Deutschland");

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

it("announces a new record from the server", async () => {
  const { user } = await startPlaying({
    best: { score: 4, isNew: true, previous: 3 },
  });

  await answer(user, "Deutschland");
  await screen.findByRole(
    "heading",
    { name: "Was ist die Hauptstadt dieses Landes?" },
    slow,
  );
  await answer(user, "Kyoto");

  expect(
    await screen.findByText("Neue Bestleistung!", {}, slow),
  ).toBeInTheDocument();
  expect(screen.getByText("Deine Bestleistung: 4")).toBeInTheDocument();
});

it("plays again under the same name on a fresh quiz", async () => {
  const { api, user } = await startPlaying({ name: "Bea" });
  await answer(user, "Frankreich");

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
    await answer(user, "Frankreich");

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
  await answer(user, "Frankreich");

  await user.click(await screen.findByRole("button", { name: "Teilen" }, slow));

  expect(write).toHaveBeenCalledWith(
    `Ich habe bei What The Flag 0 Fragen in Folge richtig beantwortet. Schaffst du mehr? ${window.location.origin}/q/${ids.quizId}`,
  );
  expect(await screen.findByText("Link kopiert.")).toBeInTheDocument();
});

/** Moves the fake timers by `ms` and lets React render what they set off. */
async function advance(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

const touch = { pointerType: "touch", clientX: 50, clientY: 20 };

/** The option named `name` once arming has ended. */
async function armed(name: string): Promise<HTMLElement> {
  const option = screen.getByRole("button", { name });
  await advance(400);
  expect(option).not.toHaveAttribute("aria-disabled");
  return option;
}

describe("hold to answer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a 400 ms touch hold answers", async () => {
    const { api } = await startPlaying();
    const option = await armed("Deutschland");

    fireEvent.pointerDown(option, touch);
    await advance(300);
    expect(answers(api)).toEqual([]);
    await advance(100);
    fireEvent.pointerUp(option, touch);
    fireEvent.click(option);

    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
    });
  });

  it("a touch release at 300 ms answers nothing", async () => {
    const { api } = await startPlaying();
    const option = await armed("Deutschland");

    fireEvent.pointerDown(option, touch);
    await advance(300);
    fireEvent.pointerUp(option, touch);
    fireEvent.click(option);
    await advance(1000);
    expect(answers(api)).toEqual([]);

    fireEvent.pointerDown(option, touch);
    await advance(400);
    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
    });
  });

  it("a touch slide off the option answers nothing", async () => {
    const { api } = await startPlaying();
    const option = await armed("Deutschland");
    vi.spyOn(option, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 64 }),
    );

    fireEvent.pointerDown(option, touch);
    fireEvent.pointerMove(option, { ...touch, clientY: 70 });
    await advance(100);
    fireEvent.pointerMove(option, { ...touch, clientY: 90 });
    await advance(1000);
    fireEvent.pointerUp(option, { ...touch, clientY: 90 });
    expect(answers(api)).toEqual([]);

    fireEvent.pointerDown(option, touch);
    await advance(400);
    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
    });
  });

  it("a touch hold started at 14.8 s answers when the clock reaches 0", async () => {
    const setNow = clock();
    const { api } = await startPlaying();
    const option = await armed("Deutschland");

    setNow(14_800);
    await advance(100);
    fireEvent.pointerDown(option, touch);
    await advance(100);
    setNow(15_000);
    await advance(200);
    expect(screen.getByText("0 s")).toBeInTheDocument();
    expect(answers(api)).toEqual([]);
    await advance(100);

    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
    });
  });

  it("a hold and the expiry together send one answer", async () => {
    const setNow = clock();
    const { api } = await startPlaying();
    const option = await armed("Deutschland");

    setNow(14_600);
    await advance(100);
    fireEvent.pointerDown(option, touch);
    setNow(15_000);
    await advance(400);
    await advance(1000);

    expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
  });

  it("a click without a preceding pointer down answers at once", async () => {
    const { api } = await startPlaying();
    const option = await armed("Deutschland");

    fireEvent.click(option);

    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: 1 }]);
    });
  });

  it("options ignore activation during arming and stay reachable by Tab", async () => {
    const { api, user } = await startPlaying();
    const option = screen.getByRole("button", { name: "Frankreich" });

    expect(option).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(option);
    await user.tab();
    expect(option).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(answers(api)).toEqual([]);

    await advance(400);
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: 0 }]);
    });
  });

  it("a touch tap on the start button starts nothing", async () => {
    const api = new FakeApi().respond("GET /api/me", unknownPlayer);
    fakeRun(api, sampleQuestions);
    const { user } = renderRoute("/", { api });
    await user.type(await screen.findByLabelText("Dein Name"), "Bea");
    const start = screen.getByRole("button", { name: "Starten" });
    const starts = (): number =>
      api.calls.filter((c) => c.route === "POST /api/runs").length;

    fireEvent.pointerDown(start, touch);
    await advance(100);
    fireEvent.pointerUp(start, touch);
    fireEvent.click(start);
    await advance(1000);
    expect(starts()).toBe(0);

    fireEvent.pointerDown(start, touch);
    await advance(400);
    await waitFor(() => {
      expect(starts()).toBe(1);
    });
  });
});

it("sends the timeout when a hold that outlived the clock is released", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const setNow = clock();
    const { api } = await startPlaying();
    const option = await armed("Deutschland");

    setNow(14_900);
    await advance(100);
    fireEvent.pointerDown(option, touch);
    setNow(15_000);
    await advance(200);
    expect(answers(api)).toEqual([]);
    fireEvent.pointerUp(option, touch);

    await waitFor(() => {
      expect(answers(api)).toEqual([{ position: 0, option: null }]);
    });
  } finally {
    vi.useRealTimers();
  }
});
