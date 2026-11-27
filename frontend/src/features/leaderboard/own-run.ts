import { useLocation } from "react-router";
import { z } from "zod/mini";

const ownRunStateSchema = z.object({ runId: z.string() });

type OwnRunState = z.infer<typeof ownRunStateSchema>;

/**
 * The router state that marks `runId`'s row as own in a ranking. Router state keeps
 * the private run id out of every URL, history entry and shared link.
 */
export function ownRunState(runId: string): OwnRunState {
  return { runId };
}

/** The run that the router state marks as own. */
export function useOwnRun(): string | null {
  const parsed = ownRunStateSchema.safeParse(useLocation().state);
  return parsed.success ? parsed.data.runId : null;
}

/** The query string that asks a ranking to mark `run`'s row as own. */
export function runQuery(run: string | null): string {
  return run ? `?run=${encodeURIComponent(run)}` : "";
}
