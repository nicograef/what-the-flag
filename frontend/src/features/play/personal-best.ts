import { z } from "zod/mini";
import { readItem, writeItem } from "@/lib/storage";

const storageKey = "wtf.best";

const storedSchema = z.object({
  score: z.int().check(z.minimum(0)),
  runId: z.string(),
});

type Stored = z.infer<typeof storedSchema>;

function read(): Stored | null {
  const raw = readItem(storageKey);
  if (raw === null) return null;
  try {
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
  writeItem(storageKey, JSON.stringify({ score, runId }));
  return { best: score, isNew: true };
}
