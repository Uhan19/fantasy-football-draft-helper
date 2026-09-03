import { loadConfig } from "../apps/server/src/config.js";
import { EspnClient } from "../apps/server/src/espn/client.js";
import { parseDraftDetail } from "../apps/server/src/espn/draft-detail.js";
import { parseFantasyTeams, parseLeagueConfig } from "../apps/server/src/espn/league-settings.js";
import { parsePlayerPool } from "../apps/server/src/espn/player-pool.js";

async function probe(): Promise<void> {
  const config = loadConfig();
  const client = new EspnClient({
    leagueId: config.leagueId,
    season: config.season,
    ...(config.espnS2 ? { espnS2: config.espnS2 } : {}),
    ...(config.espnSwid ? { swid: config.espnSwid } : {})
  });
  const [settingsRaw, teamsRaw, draftRaw, playersRaw] = await Promise.all([
    client.getSettings(),
    client.getTeams(),
    client.getDraftDetail(),
    client.getPlayerPool()
  ]);
  const league = parseLeagueConfig(settingsRaw, {
    leagueId: config.leagueId,
    season: config.season
  });
  const teams = parseFantasyTeams(teamsRaw);
  const draft = parseDraftDetail(draftRaw);
  const players = parsePlayerPool(playersRaw);

  console.log("League reachable: YES");
  console.log(`Private authentication: ${config.espnS2 ? "VALID" : "NOT REQUIRED"}`);
  console.log("mDraftDetail reachable: YES");
  console.log(
    `Draft status: ${draft.drafted && !draft.inProgress ? "COMPLETE" : draft.inProgress ? "IN_PROGRESS" : "PRE_DRAFT"}`
  );
  console.log(`Player catalog: ${players.length > 0 ? "VALID" : "EMPTY"} (${players.length})`);
  console.log(`Teams: ${teams.length || league.teamCount}`);
  console.log("");
  console.log("Live-update support:");
  console.log(draft.inProgress ? "NOT YET CONFIRMED — watch pick counts during a mock draft" : "NOT YET TESTABLE");
}

probe().catch((error) => {
  console.error(error instanceof Error ? error.message : "ESPN probe failed");
  process.exitCode = 1;
});
