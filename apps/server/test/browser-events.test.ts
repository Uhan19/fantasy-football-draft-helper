import { describe, expect, it } from "vitest";
import { DraftStateStore } from "../src/draft/state.js";
import { normalizeBrowserPayload } from "../src/ingestion/browser-events.js";
import { fixtureContext } from "./helpers.js";

describe("browser pick normalization", () => {
  it("uses configured team count for partial history and acknowledges only resolved rows", async () => {
    const context = await fixtureContext();
    const store = new DraftStateStore({ ...context, myTeamId: 1 });
    const result = normalizeBrowserPayload({ leagueId: context.league.leagueId,
      observedAt: "2026-09-03T20:00:00.000Z", picks: [
        { round: 2, pickInRound: 1, playerName: "Alpha Runner", fantasyTeamName: context.teams[0]!.name },
        { round: 2, pickInRound: 2, playerName: "Beta", fantasyTeamName: "Missing team" }
      ] }, store.get());
    expect(result.picks[0]?.overall).toBe(5);
    expect(result.acceptedIndices).toEqual([0]);
    expect(result.unresolved).toEqual([{ index: 1, overall: 6, reason: "Unknown fantasy team: Missing team" }]);
  });

  it("rejects impossible locations and does not apply snake ownership to auction picks", async () => {
    const context = await fixtureContext();
    const store = new DraftStateStore({ ...context,
      league: { ...context.league, draft: { type: "AUCTION" } },
      teams: context.teams.map((team, index) => ({ ...team, draftSlot: index + 1 })), myTeamId: 1 });
    const result = normalizeBrowserPayload({ leagueId: context.league.leagueId,
      observedAt: "2026-09-03T20:00:00.000Z", picks: [
        { overall: 1, playerName: "Alpha Runner", fantasyTeamName: "Unknown" },
        { round: 1, pickInRound: 99, playerName: "Alpha Runner", fantasyTeamName: context.teams[0]!.name }
      ] }, store.get());
    expect(result.acceptedIndices).toEqual([]);
    expect(result.unresolved).toHaveLength(2);
  });
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
