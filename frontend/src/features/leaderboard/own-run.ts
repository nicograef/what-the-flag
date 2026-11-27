import { useLocation } from "react-router";
import { z } from "zod";

const ownRunState = z.object({ runId: z.string() });

/**
 * The run whose row a ranking marks as own. The run result passes it as router state,
 * so the private run id never appears in a URL, a history entry or a shared link.
 */
export function useOwnRun(): string | null {
  const parsed = ownRunState.safeParse(useLocation().state);
  return parsed.success ? parsed.data.runId : null;
}
