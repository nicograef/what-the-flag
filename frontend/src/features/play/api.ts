import { queryOptions } from "@tanstack/react-query";
import { z } from "zod/mini";
import type { ApiClient } from "@/lib/api";

export const questionTypes = [
  "flag_name",
  "name_flag",
  "name_region",
  "name_capital",
  "capital_name",
  "flag_region",
  "name_currency",
  "flag_capital",
  "capital_flag",
  "name_language",
  "capital_region",
  "flag_currency",
  "flag_language",
  "capital_currency",
  "capital_language",
  "regional_language_name",
] as const;

export type QuestionType = (typeof questionTypes)[number];

const labelSchema = z.object({ de: z.string(), en: z.string() });

/** A prompt or an option: a flag travels as its flag key, everything else as a label. */
const itemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("flag"), flagKey: z.string() }),
  z.object({ kind: z.literal("text"), text: labelSchema }),
]);

export type Item = z.infer<typeof itemSchema>;

const optionIndexSchema = z.int().check(z.minimum(0), z.maximum(3));

/** The difficulty level the server derives from the position; the client never computes it. */
const levelSchema = z.int().check(z.minimum(1), z.maximum(10));

const questionSchema = z.object({
  position: z.int().check(z.minimum(0)),
  level: levelSchema,
  type: z.enum(questionTypes),
  prompt: itemSchema,
  options: z.tuple([itemSchema, itemSchema, itemSchema, itemSchema]),
  deadline: z.iso.datetime({ offset: true }),
  limitMs: z.int().check(z.positive()),
});

export type Question = z.infer<typeof questionSchema>;

const missedSchema = z.extend(
  z.omit(questionSchema, { deadline: true, limitMs: true, level: true }),
  {
    correctOption: optionIndexSchema,
    chosenOption: z.nullable(optionIndexSchema),
  },
);

/** The player's best over all their ended runs; `previous` is the best before this run, null on a first. */
const bestSchema = z.object({
  score: z.int().check(z.minimum(0)),
  isNew: z.boolean(),
  previous: z.nullable(z.int().check(z.minimum(0))),
});

/**
 * The learning card's facts about a missed question's target. `chosenCountry` is the country of the
 * picked option, null when no single country holds it; `spokenIn` comes with a regional-language prompt only.
 */
const factSchema = z.object({
  name: labelSchema,
  flag: z.string(),
  capital: labelSchema,
  region: labelSchema,
  languages: z.array(labelSchema),
  currencies: z.array(labelSchema),
  chosenCountry: z.nullable(labelSchema),
  spokenIn: z.optional(z.array(labelSchema)),
});

const resultSchema = z.object({
  score: z.int().check(z.minimum(0)),
  level: levelSchema,
  endReason: z.enum(["wrong", "timeout", "completed"]),
  last: z.nullable(missedSchema),
  /** Present after a miss only. */
  fact: z.optional(factSchema),
  quizRank: z.int().check(z.minimum(1)),
  globalRank: z.nullable(z.int().check(z.minimum(1))),
  best: bestSchema,
});

export type RunResultData = z.infer<typeof resultSchema>;

const runStateSchema = z.object({
  id: z.uuid(),
  quizId: z.uuid(),
  name: z.string(),
  status: z.enum(["playing", "finished"]),
  score: z.int().check(z.minimum(0)),
  serverNow: z.iso.datetime({ offset: true }),
  question: z.nullable(questionSchema),
  result: z.nullable(resultSchema),
});

export type RunState = z.infer<typeof runStateSchema>;

const outcomeSchema = z.object({
  position: z.int().check(z.minimum(0)),
  correct: z.boolean(),
  timedOut: z.boolean(),
  chosenOption: z.nullable(optionIndexSchema),
  correctOption: optionIndexSchema,
  finished: z.boolean(),
  score: z.int().check(z.minimum(0)),
});

export type Outcome = z.infer<typeof outcomeSchema>;

/** Whether a wrong answer picked the correct option: the server counts a pick within 300 ms as wrong. */
export function isTooFast(answer: {
  correctOption: number;
  chosenOption: number | null;
}): boolean {
  return answer.chosenOption === answer.correctOption;
}

const startedSchema = z.object({ runId: z.uuid(), quizId: z.uuid() });

type Started = z.infer<typeof startedSchema>;

export function startRun(
  api: ApiClient,
  body: { name: string; quizId?: string },
): Promise<Started> {
  return api.post("/api/runs", startedSchema, body);
}

export function getRun(api: ApiClient, runId: string): Promise<RunState> {
  return api.get(`/api/runs/${encodeURIComponent(runId)}`, runStateSchema);
}

/** `option` null answers nothing, which ends the run as a timeout. */
export function answerQuestion(
  api: ApiClient,
  runId: string,
  body: { position: number; option: number | null },
): Promise<Outcome> {
  return api.post(
    `/api/runs/${encodeURIComponent(runId)}/answers`,
    outcomeSchema,
    body,
  );
}

/** What the server knows of the requester's player; every field is null for an unknown one. */
const meSchema = z.object({
  lastName: z.nullable(z.string()),
  best: z.nullable(z.int().check(z.minimum(0))),
  worldRank: z.nullable(z.int().check(z.minimum(1))),
  worldBest: z.nullable(z.int().check(z.minimum(0))),
  lastQuizId: z.nullable(z.uuid()),
});

export type Me = z.infer<typeof meSchema>;

export function fetchMe(api: ApiClient): Promise<Me> {
  return api.get("/api/me", meSchema);
}

export const meKey = ["me"] as const;

/** The requester's player; starting or finishing a run invalidates it. */
export function meQuery(api: ApiClient) {
  return queryOptions({ queryKey: meKey, queryFn: () => fetchMe(api) });
}
