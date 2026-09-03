import { unknownPlayer, type DraftPick, type Player } from "@war-room/shared";
import type { ParsedDraftPick } from "./types.js";

export function normalizeEspnPick(
  pick: ParsedDraftPick,
  playersById: ReadonlyMap<number, Player>,
  observedAt = new Date().toISOString()
): DraftPick {
  const player = playersById.get(pick.playerId) ?? unknownPlayer(pick.playerId);
  return {
    overall: pick.overallPickNumber,
    round: pick.roundId,
    pickInRound: pick.roundPickNumber,
    fantasyTeamId: pick.teamId,
    playerId: pick.playerId,
    player: {
      name: player.name,
      position: player.position,
      ...(player.nflTeam ? { nflTeam: player.nflTeam } : {})
    },
    source: "espn-api",
    observedAt
  };
}
