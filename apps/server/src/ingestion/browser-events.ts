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
  acceptedIndices: number[];
  unresolved: Array<{ index: number; overall: number; reason: string }>;
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
  const acceptedIndices: number[] = [];
  for (const [index, pick] of payload.picks.entries()) {
    const overall = pick.round !== undefined && pick.pickInRound !== undefined
      ? (pick.round - 1) * state.league.teamCount + pick.pickInRound
      : pick.overall!;
    if ((pick.pickInRound !== undefined && pick.pickInRound > state.league.teamCount)
      || (pick.overall !== undefined && pick.overall !== overall)
      || (state.league.draft.rounds && overall > state.league.draft.rounds * state.league.teamCount)) {
      unresolved.push({ index, overall, reason: "Pick location is outside the configured draft" });
      continue;
    }
    const draftSlot = state.league.draft.type === "SNAKE"
      ? getDraftSlotForOverallPick(overall, state.league.teamCount) : undefined;
    const fantasyTeamId = teamByName.get(comparableName(pick.fantasyTeamName))
      ?? (draftSlot ? state.teams.find((team) => team.draftSlot === draftSlot)?.teamId : undefined);
    if (!fantasyTeamId) {
      unresolved.push({ index, overall, reason: `Unknown fantasy team: ${pick.fantasyTeamName}` });
      continue;
    }
    const catalogPlayer =
      playerByName.get(comparableName(pick.playerName))
      ?? unknownPlayer(-overall, pick.playerName);
    const location = getRoundAndPick(overall, state.league.teamCount);
    acceptedIndices.push(index);
    picks.push({
      overall,
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
  return { picks, unresolved, acceptedIndices };
}
