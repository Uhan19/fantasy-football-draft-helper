import { describe, expect, it } from "vitest";
import { DraftStateStore } from "../src/draft/state.js";
import { normalizeBrowserPayload } from "../src/ingestion/browser-events.js";
import { fixtureContext } from "./helpers.js";

describe("browser pick normalization", () => {
  it("falls back to snake draft position when practice-room team names differ", async () => {
    const context = await fixtureContext();
    const teams = context.teams.map((team, index) => ({ ...team, draftSlot: index + 1 }));
    const store = new DraftStateStore({ ...context, teams, myTeamId: 1 });

    const result = normalizeBrowserPayload({
      leagueId: context.league.leagueId,
      observedAt: "2026-09-03T20:00:00.000Z",
      picks: [{
        overall: 5,
        playerName: "Alpha Runner",
        fantasyTeamName: "Practice Room Display Name"
      }]
    }, store.get());

    expect(result.unresolved).toEqual([]);
    expect(result.picks[0]).toMatchObject({
      overall: 5,
      round: 2,
      pickInRound: 1,
      fantasyTeamId: 4,
      playerId: 101
    });
  });
});
