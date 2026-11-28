import { describe, expect, it } from "vitest";
import { isNear, selectHead } from "@/features/play/result-head";

const notNew = (previous: number | null, score: number) => ({
  score: Math.max(score, previous ?? 0),
  isNew: false,
  previous,
});

describe("selectHead", () => {
  it.each([
    {
      row: 1,
      head: "headCompleted",
      result: {
        endReason: "completed",
        score: 197,
        best: { score: 197, isNew: true, previous: 20 },
      },
      creator: { score: 30, own: false },
      actions: ["shareCompleted", "playAgain"],
    },
    {
      row: 2,
      head: "wonTitle",
      result: { endReason: "wrong", score: 31, best: notNew(40, 31) },
      creator: { score: 30, own: false },
      actions: ["tellCreator", "ownGameWorld"],
    },
    {
      row: 3,
      head: "tiedTitle",
      result: { endReason: "timeout", score: 30, best: notNew(40, 30) },
      creator: { score: 30, own: false },
      actions: ["tellCreator", "ownGameWorld"],
    },
    {
      row: 4,
      head: "headBehind",
      result: {
        endReason: "wrong",
        score: 12,
        best: { score: 12, isNew: true, previous: null },
      },
      creator: { score: 30, own: false },
      actions: ["ownGameWorld", "shareRun"],
    },
    {
      row: 5,
      head: "headFirst",
      result: {
        endReason: "wrong",
        score: 4,
        best: { score: 4, isNew: true, previous: null },
      },
      creator: null,
      actions: ["shareRecord", "playAgain"],
    },
    {
      row: 6,
      head: "headRecord",
      result: {
        endReason: "wrong",
        score: 27,
        best: { score: 27, isNew: true, previous: 23 },
      },
      creator: { score: 27, own: true },
      actions: ["shareRecord", "playAgain"],
    },
    {
      row: 7,
      head: "headTied",
      result: { endReason: "wrong", score: 23, best: notNew(23, 23) },
      creator: null,
      actions: ["playAgain", "shareRun"],
    },
    {
      row: 8,
      head: "headNearMiss",
      result: { endReason: "timeout", score: 21, best: notNew(23, 21) },
      creator: null,
      actions: ["playAgain", "shareRun"],
    },
    {
      row: 9,
      head: "headTimeout",
      result: { endReason: "timeout", score: 5, best: notNew(23, 5) },
      creator: null,
      actions: ["playAgain", "shareRun"],
    },
    {
      row: 10,
      head: "headOver",
      result: { endReason: "wrong", score: 5, best: notNew(23, 5) },
      creator: null,
      actions: ["playAgain", "shareRun"],
    },
  ] as const)(
    "row $row selects $head",
    ({ row, head, result, creator, actions }) => {
      const selected = selectHead(result, creator);

      expect([selected.row, selected.head]).toEqual([row, head]);
      expect([selected.primary, selected.secondary]).toEqual(actions);
    },
  );

  it("drops the share actions of a score of 0", () => {
    const selected = selectHead(
      {
        endReason: "wrong",
        score: 0,
        best: { score: 0, isNew: true, previous: null },
      },
      null,
    );

    expect([selected.head, selected.primary, selected.secondary]).toEqual([
      "headFirst",
      "playAgain",
      null,
    ]);
  });
});

it("counts a gap of 3 or of 15 % of the best as near", () => {
  expect(isNear(10, 8)).toBe(true);
  expect(isNear(10, 7)).toBe(false);
  expect(isNear(40, 35)).toBe(true);
  expect(isNear(40, 34)).toBe(false);
});
