import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeRun,
  sampleQuestions,
  unknownPlayer,
} from "@/features/play/fake-run";
import { FakeApi } from "@/test/fake-api";
import { answer, press } from "@/test/answer";
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
  expect(screen.getByText("1 richtig")).toBeInTheDocument();
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

it("shows the result head, run strip and missed question after a wrong answer", async () => {
  const { user } = await startPlaying({ globalRank: 12 });

  await answer(user, "Frankreich");

  expect(await screen.findByText("Leider falsch")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /^Deutschland\s*, richtige Antwort$/ }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByRole("button", { name: /^Frankreich\s*, deine Antwort$/ }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    await screen.findByRole("heading", { name: "Vorbei!" }, slow),
  ).toHaveFocus();
  expect(screen.getByText(/^richtig in Folge/)).toHaveTextContent(
    "richtig in Folge · dein bester Platz: 12 weltweit",
  );
  expect(
    screen.getByRole("img", { name: "Dein Lauf: 0 richtig, dann ein Fehler" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Deutschland").parentElement).toHaveTextContent(
    "Deutschland, richtige Antwort",
  );
  expect(screen.getByText("Frankreich").parentElement).toHaveTextContent(
    "Frankreich, deine Antwort",
  );
  expect(
    screen.queryByRole("button", { name: /Wer schafft mehr/ }),
  ).not.toBeInTheDocument();
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
    await screen.findByRole("heading", { name: "Zeit abgelaufen" }, slow),
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

it("shows the record head with the previous best", async () => {
  const { user } = await startPlaying({
    globalRank: null,
    best: { score: 2, isNew: true, previous: 1 },
  });

  await answer(user, "Deutschland");
  await screen.findByRole(
    "heading",
    { name: "Was ist die Hauptstadt dieses Landes?" },
    slow,
  );
  await answer(user, "Tokio");
  await screen.findByRole(
    "heading",
    { name: "Welche Flagge hat das Land mit dieser Hauptstadt?" },
    slow,
  );
  await answer(user, "Flagge 1");

  expect(
    await screen.findByRole("heading", { name: "Neuer Rekord!" }, slow),
  ).toHaveFocus();
  expect(screen.getByText("vorher 1")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Rekord teilen" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nochmal" })).toBeInTheDocument();
});

it("shows the gap bar after a near miss", async () => {
  const { user } = await startPlaying({
    best: { score: 3, isNew: false, previous: 3 },
  });

  await answer(user, "Deutschland");
  await screen.findByRole(
    "heading",
    { name: "Was ist die Hauptstadt dieses Landes?" },
    slow,
  );
  await answer(user, "Kyoto");

  expect(
    await screen.findByRole("heading", { name: "So knapp!" }, slow),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: "Noch 3 bis zum neuen Rekord" }),
  ).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Nochmal",
    "Wer schafft mehr als 1?",
  ]);
});

it("plays again under the same name on a fresh quiz", async () => {
  const { api, user } = await startPlaying({ name: "Bea" });
  await answer(user, "Frankreich");

  await press(user, "Nochmal");

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

/** Plays one correct answer and one miss, then opens the share sheet from the result. */
async function shareAfterOne(
  user: ReturnType<typeof renderRoute>["user"],
): Promise<void> {
  await answer(user, "Deutschland");
  await answer(user, "Kyoto");
  await press(user, "Wer schafft mehr als 1?");
}

const sharedText = (quizId: string): string =>
  `What The Flag: 1 in Folge\n🟩🟥\nGleiche Fragen. Schaffst du mehr?\n${window.location.origin}/q/${quizId}`;

it("shares the run through the system share sheet", async () => {
  const share = vi.fn<(data: ShareData) => Promise<void>>();
  share.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "share", {
    value: share,
    configurable: true,
  });
  try {
    const { ids, user } = await startPlaying();
    await shareAfterOne(user);

    await user.click(screen.getByRole("button", { name: "Teilen …" }));

    expect(share).toHaveBeenCalledWith({ text: sharedText(ids.quizId) });
  } finally {
    Reflect.deleteProperty(navigator, "share");
  }
});

it("copies text and link without a system share sheet", async () => {
  const { ids, user } = await startPlaying();
  const write = vi.spyOn(navigator.clipboard, "writeText");
  await shareAfterOne(user);

  const sheet = screen.getByRole("dialog", { name: "Fordere jemanden heraus" });
  expect(sheet).toHaveTextContent(
    "Wer den Link öffnet, spielt genau deine Fragen. Nichts wird verraten.",
  );
  expect(
    screen.queryByRole("button", { name: "Teilen …" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: "Text und Link kopieren" }),
  );

  expect(write).toHaveBeenCalledWith(sharedText(ids.quizId));
  expect(await screen.findByText("Kopiert!")).toBeInTheDocument();
});

it("closes the share sheet on Escape and returns focus to its trigger", async () => {
  const { user } = await startPlaying();
  await shareAfterOne(user);
  const sheet = screen.getByRole("dialog", { name: "Fordere jemanden heraus" });
  expect(sheet).toHaveAttribute("open");
  expect(screen.getByRole("button", { name: "Schließen" })).toHaveFocus();

  await user.keyboard("{Escape}");

  expect(sheet).not.toHaveAttribute("open");
  expect(
    screen.getByRole("button", { name: "Wer schafft mehr als 1?" }),
  ).toHaveFocus();
});

it("counts the gap pill to the record from /api/me", async () => {
  const { user } = await startPlaying({ me: { ...unknownPlayer, best: 1 } });

  expect(screen.getByText("Rekord in 2")).toBeInTheDocument();
  await answer(user, "Deutschland");
  expect(await screen.findByText("Rekord eingestellt")).toBeInTheDocument();
  await screen.findByRole(
    "heading",
    { name: "Was ist die Hauptstadt dieses Landes?" },
    slow,
  );
  await answer(user, "Tokio");
  expect(await screen.findByText("Neuer Rekord")).toBeInTheDocument();
});

it("shows no gap pill on a first run", async () => {
  const { user } = await startPlaying();

  await answer(user, "Deutschland");

  expect(await screen.findByText("1 richtig")).toBeInTheDocument();
  expect(screen.queryByText(/^Rekord/)).not.toBeInTheDocument();
  expect(screen.queryByText("Neuer Rekord")).not.toBeInTheDocument();
});

it("toasts a new record when the score passes the best", async () => {
  const { user } = await startPlaying({ me: { ...unknownPlayer, best: 1 } });
  const outcome = (): HTMLElement =>
    screen.getAllByRole("status").find((s) => s.textContent !== "")!;

  await answer(user, "Deutschland");
  await screen.findByText("Rekord eingestellt");
  expect(screen.queryByText("Neuer Rekord!")).not.toBeInTheDocument();
  await screen.findByRole(
    "heading",
    { name: "Was ist die Hauptstadt dieses Landes?" },
    slow,
  );
  await answer(user, "Tokio");

  expect(await screen.findByText("Neuer Rekord!")).toBeInTheDocument();
  expect(outcome()).toHaveTextContent(
    "Richtig!Neuer Rekord!Du hast deine 1 geknackt. Weiter so.",
  );
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

it("holds the reveal 650 ms after a correct answer and 1300 ms after a wrong one", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { api, ids } = await startPlaying();
    const reads = (): number =>
      api.calls.filter((c) => c.route === `GET /api/runs/${ids.runId}`).length;

    fireEvent.click(await armed("Deutschland"));
    await screen.findByText("Richtig!");
    const afterCorrect = reads();
    await advance(500);
    expect(reads()).toBe(afterCorrect);
    await advance(200);
    expect(reads()).toBe(afterCorrect + 1);

    await screen.findByRole("heading", {
      name: "Was ist die Hauptstadt dieses Landes?",
    });
    fireEvent.click(await armed("Kyoto"));
    await screen.findByText("Leider falsch");
    const afterWrong = reads();
    await advance(1150);
    expect(reads()).toBe(afterWrong);
    await advance(200);
    expect(reads()).toBe(afterWrong + 1);
  } finally {
    vi.useRealTimers();
  }
});

it("fills the pips by the position in the block of five", async () => {
  const api = new FakeApi();
  const ids = fakeRun(
    api,
    [...sampleQuestions, ...sampleQuestions, ...sampleQuestions],
    { score: 5 },
  );
  const { container, user } = renderRoute(`/play/${ids.runId}`, { api });
  const pips = (): (string | null)[] =>
    [...container.querySelectorAll("[data-pip]")].map((p) =>
      p.getAttribute("data-pip"),
    );
  await screen.findByRole("heading", {
    name: "Welche Flagge hat das Land mit dieser Hauptstadt?",
  });

  expect(pips()).toEqual(["current", "open", "open", "open", "open"]);
  await answer(user, "Flagge 3");
  await screen.findByText("Richtig!");
  expect(pips()).toEqual(["done", "open", "open", "open", "open"]);

  await screen.findByRole(
    "heading",
    { name: "Welches Land hat diese Flagge?" },
    slow,
  );
  expect(pips()).toEqual(["done", "current", "open", "open", "open"]);
  await answer(user, "Frankreich");
  await screen.findByText("Leider falsch");
  expect(pips()).toEqual(["done", "miss", "open", "open", "open"]);
});

it("ignores result buttons for 1000 ms and keeps their labels", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { api } = await startPlaying({ name: "Bea" });
    fireEvent.click(await armed("Frankreich"));
    await advance(1300);
    const again = await screen.findByRole("button", { name: "Nochmal" });
    const starts = (): number =>
      api.calls.filter((c) => c.route === "POST /api/runs").length;

    expect(again).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(again);
    await advance(800);
    expect(starts()).toBe(0);
    expect(again).toHaveTextContent("Nochmal");

    await advance(300);
    expect(again).not.toHaveAttribute("aria-disabled");
    expect(again).toHaveTextContent("Nochmal");
    fireEvent.click(again);
    await waitFor(() => {
      expect(starts()).toBe(1);
    });
  } finally {
    vi.useRealTimers();
  }
});
