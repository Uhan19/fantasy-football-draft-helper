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
  async function fetchView(name: string, request: () => Promise<unknown>): Promise<unknown | undefined> {
    try {
      const result = await request();
      console.log(`${name}: YES`);
      return result;
    } catch (error) {
      console.log(`${name}: NO — ${error instanceof Error ? error.message : "unknown error"}`);
      return undefined;
    }
  }

  const settingsRaw = await fetchView("mSettings reachable", () => client.getSettings());
  const teamsRaw = await fetchView("mTeam reachable", () => client.getTeams());
  const draftRaw = await fetchView("mDraftDetail reachable", () => client.getDraftDetail());
  const playersRaw = await fetchView("kona_player_info reachable", () => client.getPlayerPool());
  if (!settingsRaw || !teamsRaw || !draftRaw || !playersRaw) {
    process.exitCode = 1;
    return;
  }
  const league = parseLeagueConfig(settingsRaw, {
    leagueId: config.leagueId,
    season: config.season
  });
  const teams = parseFantasyTeams(teamsRaw);
  const draft = parseDraftDetail(draftRaw);
  const players = parsePlayerPool(playersRaw);

  console.log("");
  console.log("League reachable: YES");
  console.log(`Private authentication: ${config.espnS2 ? "VALID" : "NOT REQUIRED"}`);
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
