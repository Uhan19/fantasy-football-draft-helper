import { isEspnPlayerId, type DraftPick } from "@war-room/shared";

export interface ReconcileConflict {
  overall: number;
  kept: DraftPick;
  discarded: DraftPick;
}

export interface ReconcileResult {
  picks: DraftPick[];
  added: DraftPick[];
  upgraded: DraftPick[];
  conflicts: ReconcileConflict[];
  changed: boolean;
}

// ESPN schedules unfilled slots with placeholder IDs. Browser observations
// may legitimately use provisional negative IDs, so retain those selections.
function isSelection(pick: DraftPick): boolean {
  return pick.source !== "espn-api" || isEspnPlayerId(pick.playerId);
}

function sameSelection(left: DraftPick, right: DraftPick): boolean {
  if (left.fantasyTeamId !== right.fantasyTeamId) return false;
  if (isEspnPlayerId(left.playerId) && isEspnPlayerId(right.playerId)) return left.playerId === right.playerId;
  return left.player.name.localeCompare(right.player.name, undefined, { sensitivity: "base" }) === 0;
}

export function reconcilePicks(
  current: readonly DraftPick[],
  incoming: readonly DraftPick[]
): ReconcileResult {
  const validCurrent = current.filter(isSelection);
  const byOverall = new Map(validCurrent.map((pick) => [pick.overall, pick]));
  const added: DraftPick[] = [];
  const upgraded: DraftPick[] = [];
  const conflicts: ReconcileConflict[] = [];

  for (const candidate of incoming.filter(isSelection).sort((a, b) => a.overall - b.overall)) {
    const existing = byOverall.get(candidate.overall);
    if (!existing) {
      const secondaryDuplicate = [...byOverall.values()].some(
        (pick) =>
          isEspnPlayerId(candidate.playerId) &&
          pick.playerId === candidate.playerId &&
          pick.fantasyTeamId === candidate.fantasyTeamId
      );
      if (!secondaryDuplicate) {
        byOverall.set(candidate.overall, candidate);
        added.push(candidate);
      }
      continue;
    }

    if (sameSelection(existing, candidate)) {
      if (existing.source === "browser" && candidate.source === "espn-api") {
        byOverall.set(candidate.overall, candidate);
        upgraded.push(candidate);
      }
      continue;
    }

    if (candidate.source === "espn-api" && existing.source !== "espn-api") {
      byOverall.set(candidate.overall, candidate);
      upgraded.push(candidate);
      conflicts.push({ overall: candidate.overall, kept: candidate, discarded: existing });
    } else {
      conflicts.push({ overall: candidate.overall, kept: existing, discarded: candidate });
    }
  }

  return {
    picks: [...byOverall.values()].sort((a, b) => a.overall - b.overall),
    added,
    upgraded,
    conflicts,
    changed: validCurrent.length !== current.length || added.length > 0 || upgraded.length > 0
  };
}
