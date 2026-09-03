import { z } from "zod";

export const footballPositions = ["QB", "RB", "WR", "TE", "K", "DST", "UNKNOWN"] as const;
export const FootballPositionSchema = z.enum(footballPositions);
export type FootballPosition = z.infer<typeof FootballPositionSchema>;

export const PlayerSchema = z.object({
  espnId: z.number().int(),
  name: z.string().min(1),
  position: FootballPositionSchema,
  nflTeam: z.string().min(1).optional(),
  injuryStatus: z.string().min(1).optional(),
  byeWeek: z.number().int().min(1).max(18).optional(),
  espnRank: z.number().finite().positive().optional(),
  projectedPoints: z.number().finite().optional()
});

export type Player = z.infer<typeof PlayerSchema>;

export function unknownPlayer(espnId: number, name?: string): Player {
  return {
    espnId,
    name: name?.trim() || `Unknown ESPN Player ${espnId}`,
    position: "UNKNOWN"
  };
}
