import { z } from "zod";
import type { ApiClient } from "@/lib/api";

/** A ranked run; `own` arrives only on the row of the run named by `?run=`. */
export const entrySchema = z.object({
  rank: z.int().min(1),
  name: z.string(),
  score: z.int().min(0),
  own: z.boolean().optional(),
});

export type Entry = z.infer<typeof entrySchema>;

const leaderboardSchema = z.object({ top: z.array(entrySchema) });

export type Leaderboard = z.infer<typeof leaderboardSchema>;

/** The global list; `run` marks that run's row as `own`. */
export function getLeaderboard(
  api: ApiClient,
  run: string | null,
): Promise<Leaderboard> {
  const query = run ? `?run=${encodeURIComponent(run)}` : "";
  return api.get(`/api/leaderboard${query}`, leaderboardSchema);
}
