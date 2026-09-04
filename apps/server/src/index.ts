import { loadConfig } from "./config.js";
import { startHttpServer } from "./http/server.js";
import { LeagueRuntime } from "./league-runtime.js";
import { readLeagueSelection } from "./league-selection.js";

export async function main(): Promise<void> {
  const saved = await readLeagueSelection();
  const config = loadConfig({ ...process.env, ...(saved ? {
    ESPN_LEAGUE_ID: saved.leagueId, ESPN_SEASON: String(saved.season), MY_TEAM_ID: String(saved.myTeamId)
  } : {}) });
  const runtime = new LeagueRuntime(config);
  await startHttpServer(config, runtime.getStore, runtime.getError, {
    switchLeague: runtime.switchLeague,
    isSwitching: runtime.isSwitching
  });
  await runtime.start();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Server failed to start");
    process.exitCode = 1;
  });
}
