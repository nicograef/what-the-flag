import { messages } from "@/features/play/messages";
import { stripBlocks, type Cell } from "@/features/play/strip";
import type { Locale } from "@/lib/i18n/locale";

const emoji: Record<Cell, string> = {
  correct: "🟩",
  wrong: "🟥",
  timeout: "⏱️",
};

/** The run as emoji: blocks of five split by a space, two blocks per line, "🟩 ×{k}" past 10 answers. */
export function shareStrip(cells: Cell[]): string {
  const { folded, blocks } = stripBlocks(cells);
  const lines: string[] =
    folded === null ? [] : [`${emoji.correct} ×${folded}`];
  for (let i = 0; i < blocks.length; i += 2) {
    lines.push(
      blocks
        .slice(i, i + 2)
        .map((block) => block.map((cell) => emoji[cell]).join(""))
        .join(" "),
    );
  }
  return lines.join("\n");
}

/**
 * The message a share sends: score, run strip, challenge line and the quiz link. It names no
 * question, option or country. `wonOver` names the creator a challenge run caught or beat.
 */
export function buildShareText(
  locale: Locale,
  run: { score: number; cells: Cell[]; url: string; wonOver?: string },
): string {
  const t = messages[locale];
  if (run.wonOver !== undefined) {
    return t.shareTextWon(run.score, run.wonOver, run.url);
  }
  return t.shareText(run.score, shareStrip(run.cells), run.url);
}
