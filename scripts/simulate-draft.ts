import type { DraftPick, FantasyTeam, LeagueConfig, Player } from "../packages/shared/src/index.js";
import type { AppConfig } from "../apps/server/src/config.js";
import { DraftStateStore } from "../apps/server/src/draft/state.js";
import { getDraftSlotForOverallPick, getRoundAndPick } from "../apps/server/src/draft/snake.js";
import { startHttpServer } from "../apps/server/src/http/server.js";

const teamCount = 4;
const rounds = 3;
const league: LeagueConfig = {
  leagueId: "12345678",
  name: "Simulated Draft",
  season: 2026,
  teamCount,
  scoring: { receptionPoints: 0.5 },
  rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 },
  draft: { type: "SNAKE", rounds }
};
const teams: FantasyTeam[] = Array.from({ length: teamCount }, (_, index) => ({
  teamId: index + 1,
  name: `Sim Team ${index + 1}`,
  abbreviation: `T${index + 1}`
}));
const positions: Player["position"][] = ["RB", "WR", "RB", "WR", "TE", "QB"];
const players: Player[] = Array.from({ length: teamCount * rounds + 8 }, (_, index) => ({
  espnId: 10_000 + index,
  name: `Simulated Player ${index + 1}`,
  position: positions[index % positions.length] ?? "UNKNOWN",
  nflTeam: "SIM",
  espnRank: index + 1
}));
const port = Number(process.env.PORT ?? 8787);
const config: AppConfig = {
  leagueId: league.leagueId,
  season: league.season,
  myTeamId: 2,
  host: "127.0.0.1",
  port,
  activePollMs: 2000,
  idlePollMs: 10000,
  browserFallback: false,
  snapshotPath: new URL("../data/simulated-draft.json", import.meta.url).pathname
};
const store = new DraftStateStore({ league, teams, players, myTeamId: config.myTeamId });
const picks: DraftPick[] = [];

await startHttpServer(config, store);
console.log("Simulated draft running. Query get_draft_state at the MCP endpoint.");

const intervalMs = Number(process.env.SIMULATOR_PICK_INTERVAL_MS ?? 2000);
const interval = setInterval(() => {
  const overall = picks.length + 1;
  const player = players[overall - 1];
  if (!player) return;
  const location = getRoundAndPick(overall, teamCount);
  const slot = getDraftSlotForOverallPick(overall, teamCount);
  const team = teams.find((candidate) => candidate.teamId === slot)!;
  picks.push({
    overall,
    round: location.round,
    pickInRound: location.pickInRound,
    fantasyTeamId: team.teamId,
    playerId: player.espnId,
    player: { name: player.name, position: player.position, nflTeam: player.nflTeam! },
    source: "espn-api",
    observedAt: new Date().toISOString()
  });
  const complete = overall === teamCount * rounds;
  store.applyEspnSnapshot(
    {
      drafted: complete,
      inProgress: !complete,
      picks: [],
      draftSlotByTeamId: Object.fromEntries(teams.map((item) => [item.teamId, item.teamId]))
    },
    picks
  );
  if (complete) {
    clearInterval(interval);
    console.log("Simulated draft complete. Server remains available; press Ctrl+C to stop.");
  }
}, intervalMs);
