import { describe, expect, it } from "vitest";
import { DraftStateStore } from "../src/draft/state.js";
import { parseDraftDetail } from "../src/espn/draft-detail.js";
import { normalizeEspnPick } from "../src/espn/normalizer.js";
import { fixture, fixtureContext } from "./helpers.js";

describe("normalized draft state", () => {
  it("replays a fixture and derives rosters, counts, availability and current pick", async () => {
    const context = await fixtureContext();
    const detail = parseDraftDetail(await fixture("espn-draft-detail.json"));
    const byId = new Map(context.players.map((player) => [player.espnId, player]));
    const store = new DraftStateStore({
      ...context,
      myTeamId: 2,
      now: () => new Date("2026-09-03T20:00:00.000Z")
    });
    store.applyEspnSnapshot(
      detail,
      detail.picks.map((item) => normalizeEspnPick(item, byId, "2026-09-03T20:00:00.000Z"))
    );
    const state = store.get();
    expect(state.current).toMatchObject({ completedPicks: 3, nextOverallPick: 4, teamOnClock: 4 });
    expect(state.user.currentRoster.map((player) => player.espnId)).toEqual([102]);
    expect(state.teams.find((team) => team.teamId === 2)?.positionCounts.WR).toBe(1);
    expect(state.draftedPlayerIds).toEqual([101, 102, 103]);
    expect(state.user).toMatchObject({ draftSlot: 2, nextPick: 7, picksUntilNextPick: 3, followingPick: 10 });
  });

  it("does not crash on an unknown ESPN player ID", async () => {
    const context = await fixtureContext();
    const store = new DraftStateStore({ ...context, myTeamId: 1 });
    const detail = parseDraftDetail({
      draftDetail: {
        inProgress: true,
        picks: [{ playerId: 9999, teamId: 1, overallPickNumber: 1, roundId: 1, roundPickNumber: 1 }]
      }
    });
    store.applyEspnSnapshot(detail, detail.picks.map((item) => normalizeEspnPick(item, new Map())));
    expect(store.get().user.currentRoster[0]).toMatchObject({
      espnId: 9999,
      name: "Unknown ESPN Player 9999",
      position: "UNKNOWN"
    });
  });
});
