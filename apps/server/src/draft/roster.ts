import type { FootballPosition, Player, PositionCounts } from "@war-room/shared";

export function emptyPositionCounts(): PositionCounts {
  return { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0, UNKNOWN: 0 };
}

export function countRosterPositions(players: readonly Player[]): PositionCounts {
  const counts = emptyPositionCounts();
  for (const player of players) counts[player.position] += 1;
  return counts;
}

export function calculateUnfilledStarterSlots(
  roster: readonly Player[],
  starterSlots: Readonly<Record<string, number>>
): Record<string, number> {
  const counts = countRosterPositions(roster);
  const result: Record<string, number> = {};
  for (const position of ["QB", "RB", "WR", "TE", "K", "DST"] as FootballPosition[]) {
    const required = starterSlots[position] ?? 0;
    if (required > 0) result[position] = Math.max(0, required - counts[position]);
  }

  const flexRequired = starterSlots.FLEX ?? 0;
  if (flexRequired > 0) {
    const rbOverflow = Math.max(0, counts.RB - (starterSlots.RB ?? 0));
    const wrOverflow = Math.max(0, counts.WR - (starterSlots.WR ?? 0));
    const teOverflow = Math.max(0, counts.TE - (starterSlots.TE ?? 0));
    result.FLEX = Math.max(0, flexRequired - rbOverflow - wrOverflow - teOverflow);
  }
  return result;
}
