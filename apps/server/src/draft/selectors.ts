import type { DraftState, Player } from "@war-room/shared";
import { calculateUnfilledStarterSlots } from "./roster.js";
import { getDraftSlotForOverallPick } from "./snake.js";

function compactPlayer(player: Player) {
  return {
    id: player.espnId,
    name: player.name,
    position: player.position,
    ...(player.nflTeam ? { nflTeam: player.nflTeam } : {}),
    ...(player.espnRank ? { espnRank: player.espnRank } : {}),
    ...(player.injuryStatus ? { injuryStatus: player.injuryStatus } : {}),
    ...(player.byeWeek ? { byeWeek: player.byeWeek } : {})
  };
}

function scoringLabel(receptionPoints?: number): string {
  if (receptionPoints === undefined) return "UNKNOWN";
  if (receptionPoints >= 0.9) return "PPR";
  if (receptionPoints >= 0.4) return "HALF_PPR";
  return "STANDARD";
}

export function selectMcpDraftState(
  state: DraftState,
  options: { recentPickCount?: number; availablePlayerCount?: number } = {}
) {
  const now = Date.now();
  const lastChange = state.ingest.lastStateChangeAt;
  const secondsAgo = lastChange ? Math.max(0, (now - Date.parse(lastChange)) / 1000) : undefined;
  const stale = state.status === "IN_PROGRESS" && (secondsAgo === undefined || secondsAgo > 30);
  const drafted = new Set(state.draftedPlayerIds);
  const availableCount = Math.min(200, Math.max(1, options.availablePlayerCount ?? 80));
  const recentCount = Math.min(50, Math.max(1, options.recentPickCount ?? 15));
  const available = state.playerCatalog
    .filter((player) => !drafted.has(player.espnId))
    .sort((left, right) =>
      (left.espnRank ?? Number.MAX_SAFE_INTEGER) - (right.espnRank ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, availableCount)
    .map(compactPlayer);
  const userTeam = state.teams.find((team) => team.teamId === state.user.teamId);
  const followingPick = state.user.followingPick;
  const teamsBeforeFollowingPick = state.user.nextPick && followingPick
    ? Array.from({ length: Math.max(0, followingPick - state.user.nextPick - 1) }, (_, index) => {
        const pick = state.user.nextPick! + index + 1;
        const slot = getDraftSlotForOverallPick(pick, state.league.teamCount);
        const team = state.teams.find((candidate) => candidate.draftSlot === slot);
        return team ? { pick, teamId: team.teamId, draftSlot: slot, positionCounts: team.positionCounts } : undefined;
      }).filter((value): value is NonNullable<typeof value> => Boolean(value))
    : [];

  return {
    generatedAt: new Date(now).toISOString(),
    freshness: {
      ...(secondsAgo === undefined ? {} : { lastDraftChangeSecondsAgo: Number(secondsAgo.toFixed(1)) }),
      source: state.ingest.primarySource,
      apiHealthy: state.ingest.apiHealthy,
      browserConnected: state.ingest.browserConnected,
      browserFallbackActive: state.ingest.browserFallbackActive,
      stale,
      ...(stale ? { warning: state.ingest.warning ?? "Draft state may be stale" } : state.ingest.warning ? { warning: state.ingest.warning } : {})
    },
    league: {
      id: state.league.leagueId,
      ...(state.league.name ? { name: state.league.name } : {}),
      teams: state.league.teamCount,
      scoring: scoringLabel(state.league.scoring.receptionPoints),
      draftType: state.league.draft.type,
      starters: state.league.rosterSlots
    },
    status: state.status,
    draft: state.current,
    user: {
      teamId: state.user.teamId,
      ...(state.user.draftSlot ? { draftSlot: state.user.draftSlot } : {}),
      ...(state.user.nextPick ? { nextPick: state.user.nextPick } : {}),
      ...(state.user.picksUntilNextPick !== undefined
        ? { picksUntilNextPick: state.user.picksUntilNextPick }
        : {}),
      ...(state.user.followingPick ? { followingPick: state.user.followingPick } : {}),
      roster: state.user.currentRoster.map(compactPlayer),
      positionCounts: userTeam?.positionCounts,
      unfilledStarterSlots: calculateUnfilledStarterSlots(
        state.user.currentRoster,
        state.league.rosterSlots
      )
    },
    recentPicks: state.picks.slice(-recentCount).map((pick) => ({
      overall: pick.overall,
      round: pick.round,
      pickInRound: pick.pickInRound,
      fantasyTeamId: pick.fantasyTeamId,
      player: pick.player,
      source: pick.source
    })),
    teamsBeforeFollowingPick,
    otherTeams: state.teams
      .filter((team) => team.teamId !== state.user.teamId)
      .map((team) => ({
        teamId: team.teamId,
        name: team.name,
        ...(team.draftSlot ? { draftSlot: team.draftSlot } : {}),
        roster: team.players.map(compactPlayer),
        positionCounts: team.positionCounts
      })),
    availablePlayers: available
  };
}
