import { describe, expect, it } from "vitest";
import { getDraftSlotForOverallPick, getNextPicksForDraftSlot } from "../src/draft/snake.js";

describe("snake draft math", () => {
  it.each([8, 10, 12])("maps odd and even rounds for %i teams", (teams) => {
    expect(getDraftSlotForOverallPick(1, teams)).toBe(1);
    expect(getDraftSlotForOverallPick(teams, teams)).toBe(teams);
    expect(getDraftSlotForOverallPick(teams + 1, teams)).toBe(teams);
    expect(getDraftSlotForOverallPick(teams * 2, teams)).toBe(1);
  });

  it("handles consecutive turn picks", () => {
    expect(getNextPicksForDraftSlot(10, 9, 10, 3)).toEqual([10, 11, 30]);
    expect(getNextPicksForDraftSlot(1, 19, 10, 3)).toEqual([20, 21, 40]);
  });

  it("counts only other selections before the user", () => {
    const [next] = getNextPicksForDraftSlot(4, 34, 10, 1);
    expect(next).toBe(37);
    expect(next! - 35).toBe(2);
  });
});
