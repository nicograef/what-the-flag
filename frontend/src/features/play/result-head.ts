import type { RunResultData } from "@/features/play/api";

export type HeadKey =
  | "headCompleted"
  | "wonTitle"
  | "tiedTitle"
  | "headBehind"
  | "headFirst"
  | "headRecord"
  | "headTied"
  | "headNearMiss"
  | "headTimeout"
  | "headOver";

export type SublineKey = "scoreLine" | "quizRankLine" | "recordLine";

export type Section =
  | "completedSquares"
  | "headToHead"
  | "runStrip"
  | "learningCard"
  | "challengeNote"
  | "gapBar";

export type ResultAction =
  | "shareCompleted"
  | "shareRecord"
  | "shareRun"
  | "tellCreator"
  | "playAgain"
  | "ownGameWorld";

export interface ResultHead {
  /** The row of the PRD's result table. */
  row: number;
  head: HeadKey;
  subline: SublineKey;
  sections: Section[];
  primary: ResultAction;
  secondary: ResultAction | null;
}

/** The creator of the run's quiz, as the quiz endpoint reports it; null for a hidden one. */
export interface ResultCreator {
  score: number;
  own: boolean;
}

const shares = new Set<ResultAction>([
  "shareCompleted",
  "shareRecord",
  "shareRun",
  "tellCreator",
]);

/** Whether the run ended near the best before it: a gap of at most 3, or of at most 15 % of that best. */
export function isNear(previous: number, score: number): boolean {
  const gap = previous + 1 - score;
  return gap <= 3 || gap <= 0.15 * previous;
}

function row(
  n: number,
  head: HeadKey,
  subline: SublineKey,
  sections: Section[],
  primary: ResultAction,
  secondary: ResultAction,
): ResultHead {
  return { row: n, head, subline, sections, primary, secondary };
}

function firstMatch(
  result: Pick<RunResultData, "endReason" | "score" | "best">,
  creator: ResultCreator | null,
): ResultHead {
  const { endReason, score, best } = result;
  const challenge = creator !== null && !creator.own;
  const learned: Section[] = ["runStrip", "learningCard"];

  if (endReason === "completed") {
    return row(
      1,
      "headCompleted",
      "scoreLine",
      ["completedSquares"],
      "shareCompleted",
      "playAgain",
    );
  }
  if (challenge && score > creator.score) {
    return row(
      2,
      "wonTitle",
      "quizRankLine",
      ["headToHead", ...learned, "challengeNote"],
      "tellCreator",
      "ownGameWorld",
    );
  }
  if (challenge && score === creator.score) {
    return row(
      3,
      "tiedTitle",
      "quizRankLine",
      ["headToHead", ...learned, "challengeNote"],
      "tellCreator",
      "ownGameWorld",
    );
  }
  if (challenge) {
    return row(
      4,
      "headBehind",
      "quizRankLine",
      [...learned, "challengeNote"],
      "ownGameWorld",
      "shareRun",
    );
  }
  if (best.isNew && best.previous === null) {
    return row(
      5,
      "headFirst",
      "scoreLine",
      learned,
      "shareRecord",
      "playAgain",
    );
  }
  if (best.isNew) {
    return row(
      6,
      "headRecord",
      "recordLine",
      learned,
      "shareRecord",
      "playAgain",
    );
  }
  if (best.previous !== null && score === best.previous) {
    return row(
      7,
      "headTied",
      "scoreLine",
      [...learned, "gapBar"],
      "playAgain",
      "shareRun",
    );
  }
  if (best.previous !== null && isNear(best.previous, score)) {
    return row(
      8,
      "headNearMiss",
      "scoreLine",
      [...learned, "gapBar"],
      "playAgain",
      "shareRun",
    );
  }
  if (endReason === "timeout") {
    return row(9, "headTimeout", "scoreLine", learned, "playAgain", "shareRun");
  }
  return row(10, "headOver", "scoreLine", learned, "playAgain", "shareRun");
}

/**
 * The result screen's layout: the first row of the PRD's result table whose condition holds.
 * A score of 0 has nothing to share, so its share actions drop.
 */
export function selectHead(
  result: Pick<RunResultData, "endReason" | "score" | "best">,
  creator: ResultCreator | null,
): ResultHead {
  const head = firstMatch(result, creator);
  if (result.score > 0) return head;
  const actions = [head.primary, head.secondary].filter(
    (a): a is ResultAction => a !== null && !shares.has(a),
  );
  return {
    ...head,
    primary: actions[0] ?? "playAgain",
    secondary: actions[1] ?? null,
  };
}
