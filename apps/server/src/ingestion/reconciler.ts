import type { DraftPick } from "@war-room/shared";

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

function sameSelection(left: DraftPick, right: DraftPick): boolean {
  if (left.fantasyTeamId !== right.fantasyTeamId) return false;
  if (left.playerId > 0 && right.playerId > 0) return left.playerId === right.playerId;
  return left.player.name.localeCompare(right.player.name, undefined, { sensitivity: "base" }) === 0;
}

export function reconcilePicks(
  current: readonly DraftPick[],
  incoming: readonly DraftPick[]
): ReconcileResult {
  const byOverall = new Map(current.map((pick) => [pick.overall, pick]));
  const added: DraftPick[] = [];
  const upgraded: DraftPick[] = [];
  const conflicts: ReconcileConflict[] = [];

  for (const candidate of [...incoming].sort((a, b) => a.overall - b.overall)) {
    const existing = byOverall.get(candidate.overall);
    if (!existing) {
      const secondaryDuplicate = [...byOverall.values()].some(
        (pick) =>
          candidate.playerId > 0 &&
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
    changed: added.length > 0 || upgraded.length > 0
  };
}
