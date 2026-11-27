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

const questionSchema = z.object({
  position: z.int().check(z.minimum(0)),
  type: z.enum(questionTypes),
  prompt: itemSchema,
  options: z.tuple([itemSchema, itemSchema, itemSchema, itemSchema]),
  deadline: z.iso.datetime({ offset: true }),
});

export type Question = z.infer<typeof questionSchema>;

const missedSchema = z.extend(z.omit(questionSchema, { deadline: true }), {
  correctOption: optionIndexSchema,
  chosenOption: z.nullable(optionIndexSchema),
});

export type Missed = z.infer<typeof missedSchema>;

const resultSchema = z.object({
  score: z.int().check(z.minimum(0)),
  endReason: z.enum(["wrong", "timeout", "completed"]),
  last: z.nullable(missedSchema),
  quizRank: z.int().check(z.minimum(1)),
  globalRank: z.nullable(z.int().check(z.minimum(1))),
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

const startedSchema = z.object({ runId: z.uuid(), quizId: z.uuid() });

export type Started = z.infer<typeof startedSchema>;

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
