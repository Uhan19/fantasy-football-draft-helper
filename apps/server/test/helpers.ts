import { readFile } from "node:fs/promises";
import type { FantasyTeam, LeagueConfig, Player } from "@war-room/shared";
import { parseFantasyTeams, parseLeagueConfig } from "../src/espn/league-settings.js";
import { parsePlayerPool } from "../src/espn/player-pool.js";

export async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8")
  );
}

export async function fixtureContext(): Promise<{
  league: LeagueConfig;
  teams: FantasyTeam[];
  players: Player[];
}> {
  const [settings, teams, players] = await Promise.all([
    fixture("espn-settings.json"),
    fixture("espn-teams.json"),
    fixture("player-pool.json")
  ]);
  return {
    league: parseLeagueConfig(settings, { leagueId: "12345678", season: 2026 }),
    teams: parseFantasyTeams(teams),
    players: parsePlayerPool(players)
  };
}
