import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type DraftPick,
  type DraftState,
  type DraftStatus,
  type FantasyTeam,
  type LeagueConfig,
  type Player
} from "@war-room/shared";
import { z } from "zod";
import { FootballPositionSchema } from "@war-room/shared";
import type { ParsedDraftDetail } from "../espn/types.js";
import { emptyPositionCounts } from "./roster.js";
import { rebuildDerivedState } from "./reducer.js";
import { reconcilePicks } from "../ingestion/reconciler.js";

export interface DraftStateStoreOptions {
  league: LeagueConfig;
  teams: FantasyTeam[];
  players: Player[];
  myTeamId: number;
  snapshotPath?: string;
  now?: () => Date;
}

export class DraftStateStore {
  #state: DraftState;
  readonly #snapshotPath?: string;
  readonly #now: () => Date;
  readonly #listeners = new Set<(state: DraftState) => void>();
  #persistence = Promise.resolve();

  constructor(options: DraftStateStoreOptions) {
    if (!options.teams.some((team) => team.teamId === options.myTeamId)) {
      throw new Error(`MY_TEAM_ID ${options.myTeamId} does not exist in this ESPN league`);
    }
    this.#snapshotPath = options.snapshotPath;
    this.#now = options.now ?? (() => new Date());
    this.#state = rebuildDerivedState({
      league: options.league,
      status: "PRE_DRAFT",
      ingest: {
        primarySource: "espn-api",
        apiHealthy: false,
        browserConnected: false,
        browserFallbackActive: false
      },
      teams: options.teams.map((team) => ({
        ...team,
        players: [],
        positionCounts: emptyPositionCounts()
      })),
      picks: [],
      draftedPlayerIds: [],
      playerCatalog: [...options.players],
      user: { teamId: options.myTeamId, currentRoster: [] },
      current: { completedPicks: 0, nextOverallPick: 1, round: 1, pickInRound: 1 }
    });
  }

  get(): DraftState {
    const state = structuredClone(this.#state);
    const browserAt = state.ingest.lastBrowserEventAt;
    state.ingest.browserConnected = Boolean(browserAt && this.#now().getTime() - Date.parse(browserAt) < 30_000);
    return state;
  }

  async restoreSnapshot(snapshotPath = this.#snapshotPath): Promise<void> {
    if (!snapshotPath) return;
    try {
      const snapshot = z.object({
        league: z.object({ leagueId: z.string(), season: z.number() }),
        picks: z.array(z.object({
          overall: z.number().int().positive(), round: z.number().int().positive(),
          pickInRound: z.number().int().positive(), fantasyTeamId: z.number().int().positive(),
          playerId: z.number().int(), source: z.enum(["browser", "espn-api"]),
          observedAt: z.iso.datetime(),
          player: z.object({ name: z.string(), position: FootballPositionSchema, nflTeam: z.string().optional() })
        }))
      }).parse(JSON.parse(await readFile(snapshotPath, "utf8")));
      if (snapshot.league.leagueId !== this.#state.league.leagueId
        || snapshot.league.season !== this.#state.league.season) return;
      const picks = snapshot.picks.filter((pick) => this.#state.teams.some((team) => team.teamId === pick.fantasyTeamId));
      this.#state = rebuildDerivedState({ ...this.#state, picks: reconcilePicks([], picks).picks,
        ingest: { ...this.#state.ingest,
          lastBrowserPickAt: picks.filter((pick) => pick.source === "browser").at(-1)?.observedAt },
        status: picks.length ? "IN_PROGRESS" : "PRE_DRAFT" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("Local draft snapshot could not be restored");
    }
  }

  flushSnapshot(): Promise<void> { return this.#persistence; }

  subscribe(listener: (state: DraftState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  applyEspnSnapshot(detail: ParsedDraftDetail, picks: readonly DraftPick[]): void {
    const now = this.#now().toISOString();
    const result = reconcilePicks(this.#state.picks, picks);
    const browserAhead = result.picks.some(
      (pick) => pick.source === "browser" && !picks.some((api) => api.overall === pick.overall)
    );
    const lastBrowserAt = this.#state.ingest.lastBrowserPickAt;
    const browserWaitMs = lastBrowserAt ? this.#now().getTime() - Date.parse(lastBrowserAt) : 0;
    const warning = browserAhead
      ? browserWaitMs >= 5000
        ? "ESPN draft API has not reflected browser activity after 5 seconds; browser fallback active."
        : "Browser pick is awaiting ESPN confirmation."
      : undefined;

    const teams = this.#state.teams.map((team) => {
      const draftSlot = detail.draftSlotByTeamId[team.teamId];
      return draftSlot ? { ...team, draftSlot } : team;
    });
    const status: DraftStatus = detail.drafted && !detail.inProgress
      ? "COMPLETE"
      : detail.inProgress
        ? "IN_PROGRESS"
        : result.picks.length > 0 ? "IN_PROGRESS" : "PRE_DRAFT";

    this.#state = rebuildDerivedState({
      ...this.#state,
      teams,
      status,
      picks: result.picks,
      ingest: {
        ...this.#state.ingest,
        primarySource: browserAhead ? "browser" : "espn-api",
        apiHealthy: true,
        browserFallbackActive: browserAhead,
        lastEspnPollAt: now,
        ...(result.changed ? { lastStateChangeAt: now } : {}),
        ...(warning ? { warning } : { warning: undefined })
      }
    });
    this.#afterMutation(result.changed, result.added);
    for (const conflict of result.conflicts) {
      console.warn("draft_reconciliation_conflict", {
        overall: conflict.overall,
        keptSource: conflict.kept.source,
        discardedSource: conflict.discarded.source
      });
    }
  }

  applyBrowserPicks(picks: readonly DraftPick[], diagnostics?: DraftState["ingest"]["browserDiagnostics"]): void {
    const now = this.#now().toISOString();
    const result = reconcilePicks(this.#state.picks, picks);
    const inferredStatus = this.#state.status === "PRE_DRAFT" && result.picks.length > 0
      ? "IN_PROGRESS"
      : this.#state.status;
    this.#state = rebuildDerivedState({
      ...this.#state,
      status: inferredStatus,
      picks: result.picks,
      ingest: {
        ...this.#state.ingest,
        primarySource: result.changed ? "browser" : this.#state.ingest.primarySource,
        browserConnected: true,
        browserFallbackActive: result.changed || this.#state.ingest.browserFallbackActive,
        lastBrowserEventAt: now,
        ...(diagnostics ? { browserDiagnostics: diagnostics } : {}),
        ...(result.changed ? { lastBrowserPickAt: now } : {}),
        ...(result.changed ? { lastStateChangeAt: now } : {}),
        ...(result.changed ? { warning: "Browser pick is awaiting ESPN confirmation." } : {})
      }
    });
    this.#afterMutation(result.changed, result.added);
  }

  markApiFailure(message: string): void {
    this.#state = {
      ...this.#state,
      ingest: { ...this.#state.ingest, apiHealthy: false, warning: message }
    };
    this.#emit();
  }

  #afterMutation(changed: boolean, added: readonly DraftPick[]): void {
    for (const pick of added) {
      console.log(`Pick ${pick.overall}: ${pick.player.name} → Team ${pick.fantasyTeamId}`);
    }
    this.#emit();
    if (changed) {
      const snapshot = JSON.stringify(this.#state, null, 2);
      this.#persistence = this.#persistence.then(() => this.#persist(snapshot));
    }
  }

  #emit(): void {
    const snapshot = this.get();
    for (const listener of this.#listeners) listener(snapshot);
  }

  async #persist(snapshot: string): Promise<void> {
    if (!this.#snapshotPath) return;
    try {
      await mkdir(dirname(this.#snapshotPath), { recursive: true });
      const temporaryPath = `${this.#snapshotPath}.tmp`;
      await writeFile(temporaryPath, `${snapshot}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.#snapshotPath);
    } catch (error) {
      console.warn("Unable to write local draft snapshot", {
        message: error instanceof Error ? error.message : "unknown error"
      });
    }
  }
}
