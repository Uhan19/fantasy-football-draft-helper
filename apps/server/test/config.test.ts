import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, projectRoot } from "../src/config.js";

describe("configuration", () => {
  it("resolves project-relative paths from the monorepo root", () => {
    const config = loadConfig({
      ESPN_LEAGUE_ID: "12345678",
      ESPN_SEASON: "2026",
      MY_TEAM_ID: "7",
      ENABLE_BROWSER_FALLBACK: "false",
      SNAPSHOT_PATH: "./data/test-state.json"
    });

    expect(config.snapshotPath).toBe(resolve(projectRoot, "data/test-state.json"));
  });

  it("requires both private-league cookies", () => {
    expect(() =>
      loadConfig({
        ESPN_LEAGUE_ID: "12345678",
        ESPN_SEASON: "2026",
        ESPN_S2: "secret",
        MY_TEAM_ID: "7",
        ENABLE_BROWSER_FALLBACK: "false"
      })
    ).toThrow(/ESPN_S2 and ESPN_SWID must be configured together/);
  });
});
