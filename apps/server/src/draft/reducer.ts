import {
  unknownPlayer,
  isEspnPlayerId,
  type DraftPick,
  type DraftState,
  type DraftTeamState,
  type Player
} from "@war-room/shared";
import { countRosterPositions } from "./roster.js";
import {
  getDraftSlotForOverallPick,
  getNextPicksForDraftSlot,
  getRoundAndPick
} from "./snake.js";

export function rebuildDerivedState(state: DraftState): DraftState {
  const catalog = new Map(state.playerCatalog.map((player) => [player.espnId, player]));
  const rosterByTeam = new Map<number, Player[]>();
  const inferredSlotByTeam = new Map<number, number>();

  for (const pick of state.picks) {
    const teamRoster = rosterByTeam.get(pick.fantasyTeamId) ?? [];
    teamRoster.push(
      catalog.get(pick.playerId) ?? {
        ...unknownPlayer(pick.playerId, pick.player.name),
        position: pick.player.position,
        ...(pick.player.nflTeam ? { nflTeam: pick.player.nflTeam } : {})
      }
    );
    rosterByTeam.set(pick.fantasyTeamId, teamRoster);
    if (!inferredSlotByTeam.has(pick.fantasyTeamId) && state.league.draft.type === "SNAKE") {
      inferredSlotByTeam.set(
        pick.fantasyTeamId,
        getDraftSlotForOverallPick(pick.overall, state.league.teamCount)
      );
    }
  }

  const teams: DraftTeamState[] = state.teams.map((team) => {
    const players = rosterByTeam.get(team.teamId) ?? [];
    const draftSlot = team.draftSlot ?? inferredSlotByTeam.get(team.teamId);
    return {
      ...team,
      ...(draftSlot ? { draftSlot } : {}),
      players,
      positionCounts: countRosterPositions(players)
    };
  });

  // A room opened late may expose only recent picks. Do not rewind the clock to
  // the number of rows we happened to capture.
  const completedPicks = Math.max(0, ...state.picks.map((pick) => pick.overall));
  const nextOverallPick = completedPicks + 1;
  const current = getRoundAndPick(nextOverallPick, state.league.teamCount);
  const userTeam = teams.find((team) => team.teamId === state.user.teamId);
  const draftSlot = userTeam?.draftSlot;
  const totalPicks = state.league.draft.rounds ? state.league.teamCount * state.league.draft.rounds : undefined;
  const isFinished = state.status === "COMPLETE" || (totalPicks !== undefined && completedPicks >= totalPicks);
  const upcoming =
    draftSlot && state.league.draft.type === "SNAKE" && !isFinished
      ? getNextPicksForDraftSlot(draftSlot, completedPicks, state.league.teamCount, 2)
        .filter((pick) => totalPicks === undefined || pick <= totalPicks)
      : [];
  const nextPick = upcoming[0];
  const followingPick = upcoming[1];
  const slotOnClock =
    state.league.draft.type === "SNAKE" && !isFinished
      ? getDraftSlotForOverallPick(nextOverallPick, state.league.teamCount)
      : undefined;
  const teamOnClock = teams.find((team) => team.draftSlot === slotOnClock)?.teamId;

  return {
    ...state,
    status: isFinished ? "COMPLETE" : state.status,
    teams,
    draftedPlayerIds: state.picks.filter((pick) => isEspnPlayerId(pick.playerId)).map((pick) => pick.playerId),
    user: {
      teamId: state.user.teamId,
      ...(draftSlot ? { draftSlot } : {}),
      currentRoster: userTeam?.players ?? [],
      ...(nextPick ? { nextPick, picksUntilNextPick: Math.max(0, nextPick - nextOverallPick) } : {}),
      ...(followingPick ? { followingPick } : {})
    },
    current: {
      completedPicks,
      recordedPicks: state.picks.length,
      missingPicks: completedPicks - state.picks.length,
      nextOverallPick,
      round: current.round,
      pickInRound: current.pickInRound,
      ...(teamOnClock ? { teamOnClock } : {})
    }
  };
}
