function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

export function getRoundAndPick(overallPick: number, teamCount: number): {
  round: number;
  pickInRound: number;
} {
  positiveInteger(overallPick, "overallPick");
  positiveInteger(teamCount, "teamCount");
  return {
    round: Math.ceil(overallPick / teamCount),
    pickInRound: ((overallPick - 1) % teamCount) + 1
  };
}

export function getDraftSlotForOverallPick(overallPick: number, teamCount: number): number {
  const { round, pickInRound } = getRoundAndPick(overallPick, teamCount);
  return round % 2 === 1 ? pickInRound : teamCount - pickInRound + 1;
}

export function getNextPicksForDraftSlot(
  slot: number,
  afterOverall: number,
  teamCount: number,
  count: number
): number[] {
  positiveInteger(slot, "slot");
  positiveInteger(teamCount, "teamCount");
  if (slot > teamCount) throw new RangeError("slot cannot exceed teamCount");
  if (!Number.isInteger(afterOverall) || afterOverall < 0) {
    throw new RangeError("afterOverall must be a non-negative integer");
  }
  if (!Number.isInteger(count) || count < 0) throw new RangeError("count must be non-negative");

  const result: number[] = [];
  let overall = afterOverall + 1;
  while (result.length < count) {
    if (getDraftSlotForOverallPick(overall, teamCount) === slot) result.push(overall);
    overall += 1;
  }
  return result;
}
