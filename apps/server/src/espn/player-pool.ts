import { PlayerSchema, type FootballPosition, type Player } from "@war-room/shared";
import { z } from "zod";

const RootSchema = z.object({ players: z.array(z.unknown()).optional() }).passthrough();
const positionById: Record<number, FootballPosition> = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST"
};
const nflTeamById: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
  22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS",
  29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ranking(player: Record<string, unknown>): number | undefined {
  const rankings = record(player.draftRanksByRankType);
  for (const key of ["PPR", "STANDARD", "HALF_PPR", "0"]) {
    const rank = number(record(rankings[key]).rank);
    if (rank !== undefined && rank > 0) return rank;
  }
  for (const value of Object.values(rankings)) {
    const rank = number(record(value).rank);
    if (rank !== undefined && rank > 0) return rank;
  }
  return undefined;
}

function projection(player: Record<string, unknown>): number | undefined {
  if (!Array.isArray(player.stats)) return undefined;
  const stats = player.stats.map(record);
  const projected = stats.find((stat) => stat.statSourceId === 1 && stat.scoringPeriodId === 0)
    ?? stats.find((stat) => stat.statSourceId === 1);
  return number(projected?.appliedTotal);
}

export function parsePlayerPool(input: unknown): Player[] {
  const root = RootSchema.parse(input);
  const players: Player[] = [];

  for (const entry of root.players ?? []) {
    const wrapper = record(entry);
    const raw = record(wrapper.player ?? entry);
    const espnId = number(raw.id);
    const name = typeof raw.fullName === "string" ? raw.fullName.trim() : "";
    if (espnId === undefined || !name) continue;
    const positionId = number(raw.defaultPositionId);
    const proTeamId = number(raw.proTeamId);
    const injuryStatus = typeof raw.injuryStatus === "string" ? raw.injuryStatus : undefined;
    const byeWeek = number(raw.byeWeek);
    const espnRank = ranking(raw);
    const projectedPoints = projection(raw);
    const candidate = {
      espnId,
      name,
      position: (positionId === undefined ? undefined : positionById[positionId]) ?? "UNKNOWN",
      ...(proTeamId !== undefined && nflTeamById[proTeamId]
        ? { nflTeam: nflTeamById[proTeamId] }
        : {}),
      ...(injuryStatus ? { injuryStatus } : {}),
      ...(byeWeek !== undefined && byeWeek >= 1 && byeWeek <= 18 ? { byeWeek } : {}),
      ...(espnRank !== undefined ? { espnRank } : {}),
      ...(projectedPoints !== undefined ? { projectedPoints } : {})
    };
    const parsed = PlayerSchema.safeParse(candidate);
    if (parsed.success) players.push(parsed.data);
  }

  return players.sort((left, right) =>
    (left.espnRank ?? Number.MAX_SAFE_INTEGER) - (right.espnRank ?? Number.MAX_SAFE_INTEGER)
  );
}
