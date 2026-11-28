import type { Item, QuestionType } from "@/features/play/api";
import type { FakeApi, Json } from "@/test/fake-api";

interface FakeQuestion {
  type: QuestionType;
  prompt: Item;
  options: [Item, Item, Item, Item];
  correctOption: number;
}

interface FakeRunOptions {
  name?: string;
  /** The time left on a served question when it is read. */
  remainingMs?: number;
  quizRank?: number;
  globalRank?: number | null;
  /** The result's `best`; by default the run's own score, not new, without a previous best. */
  best?: { score: number; isNew: boolean; previous: number | null };
  /** Every answer arrives within the minimum answer time, so even the correct option is wrong. */
  tooFast?: boolean;
}

interface RunRecord {
  id: string;
  name: string;
  score: number;
  ended: {
    reason: "wrong" | "timeout" | "completed";
    chosen: number | null;
  } | null;
}

/** The `GET /api/me` body for a visitor the server does not know. */
export const unknownPlayer: Json = {
  lastName: null,
  best: null,
  worldRank: null,
  worldBest: null,
  lastQuizId: null,
};

const fakeQuizId = "00000000-0000-4000-8000-0000000000aa";
const serverNow = "2026-01-01T12:00:00.000000Z";

function runId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/**
 * A stateful run server on `FakeApi`: the first run exists at once, and each
 * `POST /api/runs` creates the next one over the same questions.
 */
export function fakeRun(
  api: FakeApi,
  questions: FakeQuestion[],
  options: FakeRunOptions = {},
): { runId: string; quizId: string } {
  const {
    remainingMs = 15_000,
    quizRank = 1,
    globalRank = 1,
    tooFast = false,
  } = options;
  const runs: RunRecord[] = [];
  const deadline = new Date(Date.parse(serverNow) + remainingMs).toISOString();

  function wire(q: FakeQuestion): { [key: string]: Json } {
    return { type: q.type, prompt: q.prompt, options: q.options };
  }

  function state(run: RunRecord): Json {
    const base = {
      id: run.id,
      quizId: fakeQuizId,
      name: run.name,
      score: run.score,
      serverNow,
    };
    if (!run.ended) {
      return {
        ...base,
        status: "playing",
        question: {
          ...wire(questions[run.score]),
          position: run.score,
          level: fakeLevel(run.score),
          deadline,
          limitMs: 15_000,
        },
        result: null,
      };
    }
    const missed = questions[run.score];
    return {
      ...base,
      status: "finished",
      question: null,
      result: {
        score: run.score,
        level: fakeLevel(
          run.ended.reason === "completed" ? run.score - 1 : run.score,
        ),
        endReason: run.ended.reason,
        last:
          run.ended.reason === "completed" || !missed
            ? null
            : {
                ...wire(missed),
                position: run.score,
                correctOption: missed.correctOption,
                chosenOption: run.ended.chosen,
              },
        quizRank,
        globalRank,
        best: options.best ?? {
          score: run.score,
          isNew: false,
          previous: null,
        },
      },
    };
  }

  function answer(run: RunRecord, body: unknown): Json {
    const { position, option } = body as {
      position: number;
      option: number | null;
    };
    const q = questions[position];
    const correct = !tooFast && option === q.correctOption;
    if (correct) {
      run.score += 1;
      if (run.score === questions.length)
        run.ended = { reason: "completed", chosen: null };
    } else {
      run.ended = {
        reason: option === null ? "timeout" : "wrong",
        chosen: option,
      };
    }
    return {
      position,
      correct,
      timedOut: option === null,
      chosenOption: option,
      correctOption: q.correctOption,
      finished: run.ended !== null,
      score: run.score,
    };
  }

  function create(name: string): RunRecord {
    const run: RunRecord = {
      id: runId(runs.length + 1),
      name,
      score: 0,
      ended: null,
    };
    runs.push(run);
    api.respond(`GET /api/runs/${run.id}`, () => state(run));
    api.respond(`POST /api/runs/${run.id}/answers`, (call) =>
      answer(run, call.body),
    );
    return run;
  }

  const first = create(options.name ?? "Ada");
  api.respond(
    "POST /api/runs",
    (call) => ({
      runId: create((call.body as { name: string }).name).id,
      quizId: fakeQuizId,
    }),
    201,
  );
  return { runId: first.id, quizId: fakeQuizId };
}

function text(de: string, en: string): Item {
  return { kind: "text", text: { de, en } };
}

function flag(flagKey: string): Item {
  return { kind: "flag", flagKey };
}

/** Three questions: a flag prompt, a text prompt, flag options. */
export const sampleQuestions: FakeQuestion[] = [
  {
    type: "flag_name",
    prompt: flag("0000000001"),
    options: [
      text("Frankreich", "France"),
      text("Deutschland", "Germany"),
      text("Italien", "Italy"),
      text("Spanien", "Spain"),
    ],
    correctOption: 1,
  },
  {
    type: "name_capital",
    prompt: text("Japan", "Japan"),
    options: [
      text("Tokio", "Tokyo"),
      text("Kyoto", "Kyoto"),
      text("Osaka", "Osaka"),
      text("Seoul", "Seoul"),
    ],
    correctOption: 0,
  },
  {
    type: "capital_flag",
    prompt: text("Paris", "Paris"),
    options: [
      flag("0000000002"),
      flag("0000000003"),
      flag("0000000004"),
      flag("0000000005"),
    ],
    correctOption: 2,
  },
];

/** The server's level of a 0-based position, which the fake server mirrors. */
function fakeLevel(position: number): number {
  return Math.min(10, 1 + Math.floor(Math.max(0, position) / 5));
}
