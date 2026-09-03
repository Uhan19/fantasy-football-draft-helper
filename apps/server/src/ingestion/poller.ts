import type { Player } from "@war-room/shared";
import { DraftStateStore } from "../draft/state.js";
import { EspnAuthenticationError, EspnClient } from "../espn/client.js";
import { parseDraftDetail } from "../espn/draft-detail.js";
import { normalizeEspnPick } from "../espn/normalizer.js";

export interface EspnDraftPollerOptions {
  client: EspnClient;
  store: DraftStateStore;
  players: readonly Player[];
  activeIntervalMs: number;
  idleIntervalMs: number;
}

export class EspnDraftPoller {
  readonly #client: EspnClient;
  readonly #store: DraftStateStore;
  readonly #playersById: Map<number, Player>;
  readonly #activeIntervalMs: number;
  readonly #idleIntervalMs: number;
  #timer?: NodeJS.Timeout;
  #stopped = true;
  #consecutiveFailures = 0;

  constructor(options: EspnDraftPollerOptions) {
    this.#client = options.client;
    this.#store = options.store;
    this.#playersById = new Map(options.players.map((player) => [player.espnId, player]));
    this.#activeIntervalMs = options.activeIntervalMs;
    this.#idleIntervalMs = options.idleIntervalMs;
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#schedule(0);
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  async pollOnce(): Promise<void> {
    const raw = await this.#client.getDraftDetail();
    const detail = parseDraftDetail(raw);
    const observedAt = new Date().toISOString();
    const picks = detail.picks.map((pick) =>
      normalizeEspnPick(pick, this.#playersById, observedAt)
    );
    this.#store.applyEspnSnapshot(detail, picks);
  }

  #schedule(delay: number): void {
    if (this.#stopped) return;
    this.#timer = setTimeout(() => void this.#tick(), delay);
  }

  async #tick(): Promise<void> {
    try {
      await this.pollOnce();
      this.#consecutiveFailures = 0;
      const state = this.#store.get();
      const expectedPicks = state.league.draft.rounds
        ? state.league.draft.rounds * state.league.teamCount
        : undefined;
      if (
        state.status === "COMPLETE" &&
        (expectedPicks === undefined || state.current.completedPicks >= expectedPicks)
      ) {
        this.stop();
        console.log("✓ Draft complete; ESPN polling stopped");
        return;
      }
      this.#schedule(state.status === "IN_PROGRESS" ? this.#activeIntervalMs : this.#idleIntervalMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ESPN polling failure";
      this.#store.markApiFailure(message);
      if (error instanceof EspnAuthenticationError) {
        console.error(message);
        this.stop();
        return;
      }
      const backoff = [2000, 4000, 8000, 15000][Math.min(this.#consecutiveFailures, 3)] ?? 15000;
      this.#consecutiveFailures += 1;
      console.warn(`ESPN polling failed; retrying in ${backoff / 1000}s`, { message });
      this.#schedule(backoff);
    }
  }
}
