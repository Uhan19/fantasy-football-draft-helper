import { basename, dirname, extname, join } from "node:path";
import type { AppConfig } from "./config.js";
import { DraftStateStore } from "./draft/state.js";
import { EspnClient } from "./espn/client.js";
import { parseDraftDetail } from "./espn/draft-detail.js";
import { parseFantasyTeams, parseLeagueConfig } from "./espn/league-settings.js";
import { normalizeEspnPick } from "./espn/normalizer.js";
import { parsePlayerPool } from "./espn/player-pool.js";
import { EspnDraftPoller } from "./ingestion/poller.js";
import { LeagueSelectionSchema, saveLeagueSelection, leagueSelectionPath, type LeagueSelection } from "./league-selection.js";

interface PreparedLeague {
  store: DraftStateStore;
  poller: EspnDraftPoller;
  detail: ReturnType<typeof parseDraftDetail>;
  picks: ReturnType<typeof normalizeEspnPick>[];
}

export class LeagueRuntime {
  #store?: DraftStateStore;
  #poller?: EspnDraftPoller;
  #error?: string;
  #retry?: NodeJS.Timeout;
  #generation = 0;
  #switching = false;

  constructor(readonly config: AppConfig, readonly selectionPath = leagueSelectionPath) {}

  getStore = (): DraftStateStore | undefined => this.#store;
  getError = (): string | undefined => this.#error;
  isSwitching = (): boolean => this.#switching;
  start = (): Promise<void> => this.#initialize(this.#generation);

  async #prepare(config: AppConfig): Promise<PreparedLeague> {
    const client = new EspnClient({ leagueId: config.leagueId, season: config.season,
      ...(config.espnS2 ? { espnS2: config.espnS2 } : {}),
      ...(config.espnSwid ? { swid: config.espnSwid } : {}) });
    const [settingsRaw, teamsRaw, playersRaw, draftRaw] = await Promise.all([
      client.getSettings(), client.getTeams(), client.getPlayerPool(), client.getDraftDetail()
    ]);
    const league = parseLeagueConfig(settingsRaw, { leagueId: config.leagueId, season: config.season });
    const teams = parseFantasyTeams(teamsRaw);
    const players = parsePlayerPool(playersRaw);
    const detail = parseDraftDetail(draftRaw);
    const byId = new Map(players.map((player) => [player.espnId, player]));
    const file = basename(config.snapshotPath, extname(config.snapshotPath));
    const snapshotPath = join(dirname(config.snapshotPath), `${file}-${config.leagueId}-${config.season}.json`);
    const store = new DraftStateStore({ league, teams, players, myTeamId: config.myTeamId, snapshotPath });
    // Import the previous single-file snapshot when it belongs to this league,
    // then prefer the dedicated snapshot so switching rooms never mixes history.
    await store.restoreSnapshot(config.snapshotPath);
    await store.restoreSnapshot();
    const observedAt = new Date().toISOString();
    const picks = detail.picks.map((pick) => normalizeEspnPick(pick, byId, observedAt));
    const poller = new EspnDraftPoller({ client, store, players,
      activeIntervalMs: config.activePollMs, idleIntervalMs: config.idlePollMs });
    return { store, poller, detail, picks };
  }

  #activate(prepared: PreparedLeague): void {
    prepared.store.applyEspnSnapshot(prepared.detail, prepared.picks);
    this.#store = prepared.store;
    this.#poller = prepared.poller;
    this.#error = undefined;
    this.#poller.start();
    console.log(`✓ Connected to ESPN league ${this.config.leagueId} (${this.config.season}), team ${this.config.myTeamId}`);
  }

  async #initialize(generation: number): Promise<void> {
    try {
      const prepared = await this.#prepare({ ...this.config });
      if (generation !== this.#generation) return;
      this.#activate(prepared);
    } catch (error) {
      if (generation !== this.#generation) return;
      const message = error instanceof Error ? error.message : "Unable to load ESPN league";
      if (this.#error !== message) console.warn(`ESPN: ${message}. Choose a league on the local dashboard; retrying in 15 seconds.`);
      this.#error = message;
      this.#scheduleRetry(generation);
    }
  }

  #scheduleRetry(generation: number): void {
    clearTimeout(this.#retry);
    this.#retry = setTimeout(() => { void this.#initialize(generation); }, 15_000);
  }

  switchLeague = async (input: LeagueSelection): Promise<void> => {
    const selection = LeagueSelectionSchema.parse(input);
    if (this.#switching) throw new Error("A league connection is already in progress. Please wait.");
    this.#switching = true;
    const generation = ++this.#generation;
    clearTimeout(this.#retry);
    this.#poller?.stop();
    try {
      await this.#store?.flushSnapshot();
      const prepared = await this.#prepare({ ...this.config, ...selection });
      await saveLeagueSelection(selection, this.selectionPath);
      Object.assign(this.config, selection);
      this.#activate(prepared);
    } catch (error) {
      this.#poller?.start();
      if (!this.#store) this.#scheduleRetry(generation);
      throw error;
    } finally {
      this.#switching = false;
    }
  };
}
