import { describe, expect, it } from "vitest";
import type { z } from "zod/mini";
import { getChallenge } from "@/features/challenge/api";
import { getLeaderboard } from "@/features/leaderboard/api";
import {
  answerQuestion,
  getRun,
  questionTypes,
  startRun,
} from "@/features/play/api";
import type { ApiClient } from "@/lib/api";

// The backend's contract tests write these from real responses; `-update` regenerates them.
const goldens: Record<string, unknown> = import.meta.glob(
  "../../../backend/internal/contract/testdata/*.json",
  { eager: true, import: "default" },
);

function golden(name: string): unknown {
  const body =
    goldens[`../../../backend/internal/contract/testdata/${name}.json`];
  if (body === undefined) throw new Error(`no golden file ${name}.json`);
  return body;
}

/** An ApiClient whose every call parses body with the caller's schema. */
function serving(body: unknown): ApiClient {
  const parse = <T>(_path: string, schema: z.ZodMiniType<T>): Promise<T> =>
    Promise.resolve(schema.parse(body));
  return { get: parse, post: parse };
}

const calls: [string, (api: ApiClient) => Promise<unknown>][] = [
  ["start", (api) => startRun(api, { name: "Ada" })],
  ["run-playing", (api) => getRun(api, "id")],
  ["run-finished", (api) => getRun(api, "id")],
  ["run-timeout", (api) => getRun(api, "id")],
  [
    "outcome-wrong",
    (api) => answerQuestion(api, "id", { position: 0, option: 1 }),
  ],
  [
    "outcome-timeout",
    (api) => answerQuestion(api, "id", { position: 0, option: null }),
  ],
  ["challenge", (api) => getChallenge(api, "id", null)],
  ["challenge-hidden", (api) => getChallenge(api, "id", null)],
  ["leaderboard", (api) => getLeaderboard(api, null)],
];

describe("backend responses", () => {
  it.each(calls)("%s parses unchanged", async (name, call) => {
    const body = golden(name);
    await expect(call(serving(body))).resolves.toEqual(body);
  });

  it("questionTypes holds exactly the backend's question types", () => {
    expect(new Set(questionTypes)).toEqual(
      new Set(golden("question-types") as string[]),
    );
  });
});
