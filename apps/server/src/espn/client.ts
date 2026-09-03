import { buildEspnCookie, type EspnCredentials } from "./auth.js";

export class EspnAuthenticationError extends Error {
  constructor() {
    super("ESPN authentication failed. Refresh ESPN_S2 / SWID.");
    this.name = "EspnAuthenticationError";
  }
}

export class EspnResponseError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "EspnResponseError";
  }
}

export interface EspnClientOptions extends EspnCredentials {
  leagueId: string;
  season: number;
  fetchImpl?: typeof fetch;
}

export class EspnClient {
  readonly #baseUrl: URL;
  readonly #cookie?: string;
  readonly #fetch: typeof fetch;

  constructor(options: EspnClientOptions) {
    if (!/^\d+$/.test(options.leagueId)) {
      throw new Error("ESPN_LEAGUE_ID must contain digits only");
    }
    this.#baseUrl = new URL(
      `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${options.season}/segments/0/leagues/${options.leagueId}`
    );
    this.#cookie = buildEspnCookie({
      ...(options.espnS2 ? { espnS2: options.espnS2 } : {}),
      ...(options.swid ? { swid: options.swid } : {})
    });
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async getView(view: string, fantasyFilter?: unknown): Promise<unknown> {
    if (!/^[A-Za-z0-9_]+$/.test(view)) throw new Error("Invalid ESPN view");
    const url = new URL(this.#baseUrl);
    url.searchParams.set("view", view);
    const headers = new Headers({ Accept: "application/json" });
    if (this.#cookie) headers.set("Cookie", this.#cookie);
    if (fantasyFilter) headers.set("X-Fantasy-Filter", JSON.stringify(fantasyFilter));

    let response: Response;
    try {
      response = await this.#fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new EspnResponseError(
        `ESPN request failed: ${error instanceof Error ? error.message : "network error"}`
      );
    }

    if (response.status === 401 || response.status === 403) throw new EspnAuthenticationError();
    if (!response.ok) throw new EspnResponseError(`ESPN returned HTTP ${response.status}`, response.status);

    try {
      return await response.json();
    } catch {
      throw new EspnResponseError("ESPN returned malformed JSON", response.status);
    }
  }

  getSettings(): Promise<unknown> {
    return this.getView("mSettings");
  }

  getTeams(): Promise<unknown> {
    return this.getView("mTeam");
  }

  getDraftDetail(): Promise<unknown> {
    return this.getView("mDraftDetail");
  }

  getPlayerPool(limit = 5000): Promise<unknown> {
    return this.getView("kona_player_info", {
      players: {
        limit,
        sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" }
      }
    });
  }
}
