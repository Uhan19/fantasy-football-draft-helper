import { z } from "zod";

export const DraftTypeSchema = z.enum(["SNAKE", "AUCTION", "UNKNOWN"]);

export const LeagueConfigSchema = z.object({
  leagueId: z.string().min(1),
  name: z.string().min(1).optional(),
  season: z.number().int().min(2000),
  teamCount: z.number().int().positive(),
  scoring: z.object({ receptionPoints: z.number().optional() }),
  rosterSlots: z.record(z.string(), z.number().int().min(0)),
  draft: z.object({
    type: DraftTypeSchema,
    rounds: z.number().int().positive().optional()
  })
});

export type LeagueConfig = z.infer<typeof LeagueConfigSchema>;

export const FantasyTeamSchema = z.object({
  teamId: z.number().int().positive(),
  name: z.string().min(1),
  abbreviation: z.string().min(1).optional(),
  owner: z.string().min(1).optional()
});

export type FantasyTeam = z.infer<typeof FantasyTeamSchema>;
