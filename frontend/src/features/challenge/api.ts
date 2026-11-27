import { z } from "zod/mini";
import { entrySchema } from "@/features/leaderboard/api";
import type { ApiClient } from "@/lib/api";

const challengeSchema = z.object({
  id: z.uuid(),
  /** Null when the owner hid the creator's run. */
  creator: z.nullable(
    z.object({
      name: z.string(),
      score: z.int().check(z.minimum(0)),
      ended: z.boolean(),
    }),
  ),
  top: z.array(entrySchema),
});

export type Challenge = z.infer<typeof challengeSchema>;

/** The quiz's creator and ranking; `run` marks that run's row as `own`. */
export function getChallenge(
  api: ApiClient,
  quizId: string,
  run: string | null,
): Promise<Challenge> {
  const query = run ? `?run=${encodeURIComponent(run)}` : "";
  return api.get(
    `/api/quizzes/${encodeURIComponent(quizId)}${query}`,
    challengeSchema,
  );
}
