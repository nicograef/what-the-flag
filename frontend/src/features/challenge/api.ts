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
      /** True when the creator run is the requester's. */
      own: z.boolean(),
    }),
  ),
  top: z.array(entrySchema),
});

export type Challenge = z.infer<typeof challengeSchema>;

/** The quiz's creator and ranking; the player cookie marks the requester's row as `own`. */
export function getChallenge(
  api: ApiClient,
  quizId: string,
): Promise<Challenge> {
  return api.get(`/api/quizzes/${encodeURIComponent(quizId)}`, challengeSchema);
}
