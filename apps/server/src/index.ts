import { loadConfig } from "./config.js";
import { DraftStateStore } from "./draft/state.js";
import { EspnClient } from "./espn/client.js";
import { parseDraftDetail } from "./espn/draft-detail.js";
import { parseFantasyTeams, parseLeagueConfig } from "./espn/league-settings.js";
import { normalizeEspnPick } from "./espn/normalizer.js";
import { parsePlayerPool } from "./espn/player-pool.js";
import { startHttpServer } from "./http/server.js";
import { EspnDraftPoller } from "./ingestion/poller.js";

export async function main(): Promise<void> {
  const config = loadConfig();
  const client = new EspnClient({
    leagueId: config.leagueId,
    season: config.season,
    ...(config.espnS2 ? { espnS2: config.espnS2 } : {}),
    ...(config.espnSwid ? { swid: config.espnSwid } : {})
  });

  let store: DraftStateStore | undefined;
  let initializationError: string | undefined;
  await startHttpServer(config, () => store, () => initializationError);

  const initialize = async (): Promise<void> => {
    try {
      const [settingsRaw, teamsRaw, playersRaw, draftRaw] = await Promise.all([
        client.getSettings(), client.getTeams(), client.getPlayerPool(), client.getDraftDetail()
      ]);
      const league = parseLeagueConfig(settingsRaw, {
        leagueId: config.leagueId,
        season: config.season
      });
      const teams = parseFantasyTeams(teamsRaw);
      const players = parsePlayerPool(playersRaw);
      const detail = parseDraftDetail(draftRaw);
      const playersById = new Map(players.map((player) => [player.espnId, player]));
      const initializedStore = new DraftStateStore({
        league, teams, players, myTeamId: config.myTeamId, snapshotPath: config.snapshotPath
      });
      await initializedStore.restoreSnapshot();
      const observedAt = new Date().toISOString();
      initializedStore.applyEspnSnapshot(
        detail,
        detail.picks.map((pick) => normalizeEspnPick(pick, playersById, observedAt))
      );
      store = initializedStore;
      initializationError = undefined;

      const userTeam = store.get().teams.find((team) => team.teamId === config.myTeamId);
      console.log("✓ ESPN authentication successful");
      console.log(`✓ League: ${league.name ?? league.leagueId}`);
      console.log(`✓ ${league.teamCount} teams`);
      console.log(`✓ ${league.draft.type.toLocaleLowerCase()} draft`);
      console.log(`✓ My team: ${config.myTeamId}${userTeam ? ` (${userTeam.name})` : ""}`);
      console.log(`✓ My draft slot: ${store.get().user.draftSlot ?? "not assigned yet"}`);
      console.log(`✓ Loaded ${players.length.toLocaleString()} players`);
      console.log("✓ Draft API poller active");
      console.log(config.browserFallback ? "○ Browser fallback waiting" : "○ Browser fallback disabled");

      const poller = new EspnDraftPoller({
        client, store, players,
        activeIntervalMs: config.activePollMs,
        idleIntervalMs: config.idlePollMs
      });
      poller.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load ESPN league";
      if (initializationError !== message) {
        console.warn(`ESPN initialization failed: ${message}. Dashboard remains available; retrying in 15 seconds.`);
      }
      initializationError = message;
      setTimeout(() => { void initialize(); }, 15_000);
    }
  };
  await initialize();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Server failed to start");
    process.exitCode = 1;
  });
}
