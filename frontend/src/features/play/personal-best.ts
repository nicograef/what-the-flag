import { z } from "zod/mini";

const storageKey = "wtf.best";

const storedSchema = z.object({
  score: z.int().check(z.minimum(0)),
  runId: z.string(),
});

type Stored = z.infer<typeof storedSchema>;

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Records a finished run's score and returns the best one. A run that set the best keeps
 * `isNew`, so a reload of its result announces it again instead of comparing with itself.
 */
export function recordScore(
  runId: string,
  score: number,
): { best: number; isNew: boolean } {
  const stored = read();
  if (stored?.runId === runId) return { best: stored.score, isNew: true };
  if (score === 0 || (stored && stored.score >= score)) {
    return { best: stored?.score ?? score, isNew: false };
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify({ score, runId }));
  } catch {
    // Storage can be blocked; the best then lasts for this result only.
  }
  return { best: score, isNew: true };
}
