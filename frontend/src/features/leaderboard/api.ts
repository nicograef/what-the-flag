import { z } from "zod/mini";
import type { ApiClient } from "@/lib/api";

/** A player's best run; `own` arrives only on the requester's row. */
export const entrySchema = z.object({
  rank: z.int().check(z.minimum(1)),
  name: z.string(),
  score: z.int().check(z.minimum(0)),
  own: z.optional(z.boolean()),
});

export type Entry = z.infer<typeof entrySchema>;

const leaderboardSchema = z.object({ top: z.array(entrySchema) });

type Leaderboard = z.infer<typeof leaderboardSchema>;

/** The global list; the player cookie marks the requester's row as `own`. */
export function getLeaderboard(api: ApiClient): Promise<Leaderboard> {
  return api.get("/api/leaderboard", leaderboardSchema);
}
