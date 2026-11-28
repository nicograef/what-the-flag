import { expect, it } from "vitest";
import { buildShareText } from "@/features/play/share-text";
import type { Cell } from "@/features/play/strip";

const url = "https://what-the-flag.de/q/00000000-0000-4000-8000-0000000000aa";

function run(correct: number, end: Cell): Cell[] {
  return [...Array.from({ length: correct }, (): Cell => "correct"), end];
}

it("builds the strip of a 23-answer run with the × line", () => {
  expect(
    buildShareText("de", { score: 22, cells: run(22, "wrong"), url }),
  ).toBe(
    "What The Flag: 22 in Folge\n🟩 ×15\n🟩🟩🟩🟩🟩 🟩🟩🟥\nGleiche Fragen. Schaffst du mehr?\n" +
      url,
  );
});

it("marks a timeout with a clock", () => {
  expect(
    buildShareText("en", { score: 7, cells: run(7, "timeout"), url }),
  ).toBe(
    "What The Flag: 7 in a row\n🟩🟩🟩🟩🟩 🟩🟩⏱️\nSame questions. Can you beat it?\n" +
      url,
  );
});
