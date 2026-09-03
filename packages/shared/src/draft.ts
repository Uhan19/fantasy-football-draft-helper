import { z } from "zod";
import type { FantasyTeam, LeagueConfig } from "./league.js";
import type { FootballPosition, Player } from "./player.js";

export type DraftStatus = "PRE_DRAFT" | "IN_PROGRESS" | "COMPLETE" | "UNKNOWN";
export type PickSource = "espn-api" | "browser";

export interface DraftPick {
  overall: number;
  round: number;
  pickInRound: number;
  fantasyTeamId: number;
  playerId: number;
  player: Pick<Player, "name" | "position" | "nflTeam">;
  source: PickSource;
  observedAt: string;
}

export interface PositionCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DST: number;
  UNKNOWN: number;
}

export interface DraftTeamState extends FantasyTeam {
  draftSlot?: number;
  players: Player[];
  positionCounts: PositionCounts;
}

export interface DraftState {
  league: LeagueConfig;
  status: DraftStatus;
  ingest: {
    primarySource: PickSource;
    apiHealthy: boolean;
    browserConnected: boolean;
    browserFallbackActive: boolean;
    lastEspnPollAt?: string;
    lastBrowserEventAt?: string;
    lastStateChangeAt?: string;
    warning?: string;
  };
  teams: DraftTeamState[];
  picks: DraftPick[];
  draftedPlayerIds: number[];
  playerCatalog: Player[];
  user: {
    teamId: number;
    draftSlot?: number;
    currentRoster: Player[];
    nextPick?: number;
    picksUntilNextPick?: number;
    followingPick?: number;
  };
  current: {
    completedPicks: number;
    nextOverallPick: number;
    round: number;
    pickInRound: number;
    teamOnClock?: number;
  };
}

export const BrowserPickSchema = z.object({
  overall: z.number().int().positive(),
  playerName: z.string().trim().min(1).max(120),
  fantasyTeamName: z.string().trim().min(1).max(120)
});

export const BrowserPickPayloadSchema = z.object({
  leagueId: z.string().trim().min(1),
  observedAt: z.iso.datetime(),
  picks: z.array(BrowserPickSchema).max(500)
});

export type BrowserPickPayload = z.infer<typeof BrowserPickPayloadSchema>;
