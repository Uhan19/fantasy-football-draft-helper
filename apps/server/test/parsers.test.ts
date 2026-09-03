import { describe, expect, it } from "vitest";
import { parseDraftDetail } from "../src/espn/draft-detail.js";
import { parseFantasyTeams, parseLeagueConfig } from "../src/espn/league-settings.js";
import { parsePlayerPool } from "../src/espn/player-pool.js";
import { fixture } from "./helpers.js";

describe("fixture-backed ESPN parsers", () => {
  it("parses league settings and teams", async () => {
    const league = parseLeagueConfig(await fixture("espn-settings.json"), {
      leagueId: "12345678",
      season: 2026
    });
    const teams = parseFantasyTeams(await fixture("espn-teams.json"));
    expect(league).toMatchObject({ teamCount: 4, scoring: { receptionPoints: 0.5 } });
    expect(league.rosterSlots.FLEX).toBe(1);
    expect(teams).toHaveLength(4);
    expect(teams[0]).toMatchObject({ teamId: 1, name: "North Stars", owner: "Alex" });
  });

  it("parses and ranks the player catalog defensively", async () => {
    const players = parsePlayerPool(await fixture("player-pool.json"));
    expect(players).toHaveLength(10);
    expect(players[0]).toMatchObject({
      espnId: 101,
      position: "RB",
      nflTeam: "DET",
      espnRank: 1,
      projectedPoints: 290.1
    });
  });

  it("skips malformed picks while preserving valid sequence", async () => {
    const raw = (await fixture("espn-draft-detail.json")) as { draftDetail: { picks: unknown[] } };
    raw.draftDetail.picks.push({ playerId: "bad" });
    raw.draftDetail.picks.push({
      playerId: -1,
      teamId: 4,
      overallPickNumber: 4,
      roundId: 1,
      roundPickNumber: 4
    });
    const detail = parseDraftDetail(raw);
    expect(detail.picks.map((pick) => pick.overallPickNumber)).toEqual([1, 2, 3]);
    expect(detail.draftSlotByTeamId[4]).toBe(4);
  });
});
