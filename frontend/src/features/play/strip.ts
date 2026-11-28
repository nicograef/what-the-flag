import type { RunResultData } from "@/features/play/api";

/** One answer of a run. */
export type Cell = "correct" | "wrong" | "timeout";

/** The run's answers: one per point of the score, then the miss that ended it. */
export function runCells(
  result: Pick<RunResultData, "score" | "endReason">,
): Cell[] {
  const cells: Cell[] = Array.from({ length: result.score }, () => "correct");
  if (result.endReason === "wrong") cells.push("wrong");
  if (result.endReason === "timeout") cells.push("timeout");
  return cells;
}

/**
 * The strip in blocks of five, counted from the first answer. More than 10 answers fold all but
 * the last two blocks into `folded`, the number of correct answers they hold.
 */
export function stripBlocks(cells: Cell[]): {
  folded: number | null;
  blocks: Cell[][];
} {
  const blocks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 5) blocks.push(cells.slice(i, i + 5));
  if (cells.length <= 10) return { folded: null, blocks };
  const shown = blocks.slice(-2);
  return {
    folded: cells.length - shown.reduce((n, b) => n + b.length, 0),
    blocks: shown,
  };
}
