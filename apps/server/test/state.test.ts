import { describe, expect, it } from "vitest";
import { DraftStateStore } from "../src/draft/state.js";
import { parseDraftDetail } from "../src/espn/draft-detail.js";
import { normalizeEspnPick } from "../src/espn/normalizer.js";
import { fixture, fixtureContext } from "./helpers.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DraftPick } from "@war-room/shared";

const browserPick = (overall: number): DraftPick => ({ overall, round: Math.ceil(overall / 4),
  pickInRound: (overall - 1) % 4 + 1, fantasyTeamId: 1, playerId: -overall,
  player: { name: `Player ${overall}`, position: "RB" }, source: "browser", observedAt: "2026-09-03T20:00:00.000Z" });

describe("normalized draft state", () => {
  it("tracks late-join progress with explicit gaps and preserves browser progress on empty API polls", async () => {
    const store = new DraftStateStore({ ...await fixtureContext(), myTeamId: 1 });
    store.applyBrowserPicks([browserPick(7)]);
    store.applyEspnSnapshot({ drafted: false, inProgress: false, picks: [], draftSlotByTeamId: {} }, []);
    expect(store.get().current).toMatchObject({ nextOverallPick: 8, completedPicks: 7, recordedPicks: 1, missingPicks: 6 });
    expect(store.get().status).toBe("IN_PROGRESS");
  });

  it("expires browser connection status without requiring an API mutation", async () => {
    let now = new Date("2026-09-03T20:00:00.000Z");
    const store = new DraftStateStore({ ...await fixtureContext(), myTeamId: 1, now: () => now });
    store.applyBrowserPicks([]);
    expect(store.get().ingest.browserConnected).toBe(true);
    now = new Date(now.getTime() + 30_001);
    expect(store.get().ingest.browserConnected).toBe(false);
  });

  it("serializes snapshots, restores browser picks, and ignores other practice leagues", async () => {
    const directory = await mkdtemp(join(tmpdir(), "war-room-snapshot-"));
    try {
      const snapshotPath = join(directory, "draft.json"), context = await fixtureContext();
      const store = new DraftStateStore({ ...context, myTeamId: 1, snapshotPath });
      store.applyBrowserPicks([browserPick(1)]);
      store.applyBrowserPicks([browserPick(2)]);
      await store.flushSnapshot();
      expect(JSON.parse(await readFile(snapshotPath, "utf8")).picks).toHaveLength(2);
      const restored = new DraftStateStore({ ...context, myTeamId: 1, snapshotPath });
      await restored.restoreSnapshot();
      expect(restored.get().picks).toHaveLength(2);
      expect(restored.get().ingest.browserConnected).toBe(false);
      const other = new DraftStateStore({ ...context, league: { ...context.league, leagueId: "different" }, myTeamId: 1, snapshotPath });
      await other.restoreSnapshot();
      expect(other.get().picks).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
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
