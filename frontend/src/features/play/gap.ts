/** What the gap pill counts to: the player's record from `/api/me`, or the challenge creator's score. */
export type GapTarget =
  | { kind: "record"; score: number }
  | { kind: "creator"; name: string; score: number };

/** The questions to beat the target: target + 1 − score; 1 at the tie, 0 or less above it. */
export function gapCount(target: GapTarget, score: number): number {
  return target.score + 1 - score;
}

/** Whether a correct answer that reached `score` just passed the target. */
export function passedTarget(target: GapTarget | null, score: number): boolean {
  return target !== null && score === target.score + 1;
}
