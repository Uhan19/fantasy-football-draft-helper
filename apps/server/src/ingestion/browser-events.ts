import {
  BrowserPickPayloadSchema,
  unknownPlayer,
  type BrowserPickPayload,
  type DraftPick,
  type DraftState,
  type Player
} from "@war-room/shared";
import { getDraftSlotForOverallPick, getRoundAndPick } from "../draft/snake.js";

function comparableName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface BrowserNormalizationResult {
  picks: DraftPick[];
  unresolved: Array<{ overall: number; reason: string }>;
}

export function normalizeBrowserPayload(
  input: unknown,
  state: DraftState
): BrowserNormalizationResult {
  const payload: BrowserPickPayload = BrowserPickPayloadSchema.parse(input);
  if (payload.leagueId !== state.league.leagueId) {
    throw new Error("Browser event leagueId does not match the configured league");
  }

  const teamByName = new Map<string, number>();
  for (const team of state.teams) {
    teamByName.set(comparableName(team.name), team.teamId);
    if (team.abbreviation) teamByName.set(comparableName(team.abbreviation), team.teamId);
  }
  const playerByName = new Map<string, Player>();
  for (const player of state.playerCatalog) playerByName.set(comparableName(player.name), player);

  const picks: DraftPick[] = [];
  const unresolved: BrowserNormalizationResult["unresolved"] = [];
  for (const pick of payload.picks) {
    const draftSlot = getDraftSlotForOverallPick(pick.overall, state.league.teamCount);
    const fantasyTeamId = teamByName.get(comparableName(pick.fantasyTeamName))
      ?? state.teams.find((team) => team.draftSlot === draftSlot)?.teamId;
    if (!fantasyTeamId) {
      unresolved.push({ overall: pick.overall, reason: `Unknown fantasy team: ${pick.fantasyTeamName}` });
      continue;
    }
    const catalogPlayer =
      playerByName.get(comparableName(pick.playerName))
      ?? unknownPlayer(-pick.overall, pick.playerName);
    const location = getRoundAndPick(pick.overall, state.league.teamCount);
    picks.push({
      overall: pick.overall,
      round: location.round,
      pickInRound: location.pickInRound,
      fantasyTeamId,
      playerId: catalogPlayer.espnId,
      player: {
        name: catalogPlayer.name,
        position: catalogPlayer.position,
        ...(catalogPlayer.nflTeam ? { nflTeam: catalogPlayer.nflTeam } : {})
      },
      source: "browser",
      observedAt: payload.observedAt
    });
  }
  return { picks, unresolved };
}
