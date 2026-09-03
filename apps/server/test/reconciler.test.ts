import type { DraftPick } from "@war-room/shared";
import { describe, expect, it } from "vitest";
import { reconcilePicks } from "../src/ingestion/reconciler.js";

function pick(overall: number, source: DraftPick["source"], playerId = overall): DraftPick {
  return {
    overall,
    round: 1,
    pickInRound: overall,
    fantasyTeamId: overall,
    playerId,
    player: { name: `Player ${playerId}`, position: "RB" },
    source,
    observedAt: "2026-09-03T20:00:00.000Z"
  };
}

describe("pick reconciliation", () => {
  it("deduplicates API events and sorts out-of-order events", () => {
    const result = reconcilePicks([pick(1, "espn-api")], [pick(3, "espn-api"), pick(2, "espn-api"), pick(1, "espn-api")]);
    expect(result.picks.map((item) => item.overall)).toEqual([1, 2, 3]);
    expect(result.added).toHaveLength(2);
  });

  it("upgrades provisional browser metadata with ESPN", () => {
    const browser = { ...pick(1, "browser", -1), player: { name: "Alpha Runner", position: "UNKNOWN" as const } };
    const api = pick(1, "espn-api", 101);
    api.player.name = "Alpha Runner";
    const result = reconcilePicks([browser], [api]);
    expect(result.picks[0]).toMatchObject({ playerId: 101, source: "espn-api" });
    expect(result.upgraded).toHaveLength(1);
  });

  it("prefers ESPN when sources conflict", () => {
    const result = reconcilePicks([pick(1, "browser", 999)], [pick(1, "espn-api", 101)]);
    expect(result.picks[0]?.playerId).toBe(101);
    expect(result.conflicts).toHaveLength(1);
  });
});
