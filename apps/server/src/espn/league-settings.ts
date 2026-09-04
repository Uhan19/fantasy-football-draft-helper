import {
  FantasyTeamSchema,
  LeagueConfigSchema,
  type FantasyTeam,
  type LeagueConfig
} from "@war-room/shared";
import { z } from "zod";

const RootSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  seasonId: z.number().int().optional(),
  name: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  teams: z.array(z.record(z.string(), z.unknown())).optional(),
  members: z.array(z.record(z.string(), z.unknown())).optional()
});

const rosterSlotNames: Record<string, string> = {
  "0": "QB",
  "2": "RB",
  "4": "WR",
  "6": "TE",
  "16": "DST",
  "17": "K",
  "20": "BENCH",
  "23": "FLEX"
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseLeagueConfig(
  input: unknown,
  fallback: { leagueId: string; season: number }
): LeagueConfig {
  const root = RootSchema.parse(input);
  const settings = record(root.settings);
  const rosterSettings = record(settings.rosterSettings);
  const draftSettings = record(settings.draftSettings);
  const scoringSettings = record(settings.scoringSettings);
  const lineup = record(rosterSettings.lineupSlotCounts);
  const rosterSlots: Record<string, number> = {};
  for (const [slotId, count] of Object.entries(lineup)) {
    const numeric = finiteNumber(count);
    if (numeric === undefined) continue;
    rosterSlots[rosterSlotNames[slotId] ?? `ESPN_SLOT_${slotId}`] = numeric;
  }

  const scoringItems = Array.isArray(scoringSettings.scoringItems)
    ? scoringSettings.scoringItems
    : [];
  const receptionItem = scoringItems
    .map(record)
    .find((item) => item.statId === 53 || item.statId === "53");
  const receptionPoints = finiteNumber(receptionItem?.points);

  const rawDraftType = String(draftSettings.type ?? draftSettings.draftType ?? "").toUpperCase();
  const draftType = rawDraftType.includes("AUCTION")
    ? "AUCTION"
    : rawDraftType.includes("SNAKE") || rawDraftType.includes("STANDARD")
      ? "SNAKE"
      : "UNKNOWN";
  const rounds = finiteNumber(draftSettings.rounds) ?? finiteNumber(draftSettings.roundCount);
  const teamCount =
    finiteNumber(settings.size) ?? finiteNumber(settings.teamCount) ?? root.teams?.length;

  return LeagueConfigSchema.parse({
    leagueId: String(root.id ?? fallback.leagueId),
    ...(root.name || typeof settings.name === "string" ? { name: root.name ?? settings.name } : {}),
    season: root.seasonId ?? fallback.season,
    teamCount,
    scoring: receptionPoints === undefined ? {} : { receptionPoints },
    rosterSlots,
    draft: { type: draftType, ...(rounds ? { rounds } : {}) }
  });
}

export function parseFantasyTeams(input: unknown): FantasyTeam[] {
  const root = RootSchema.parse(input);
  const membersById = new Map(
    (root.members ?? []).map((member) => [String(member.id ?? ""), member])
  );

  return (root.teams ?? []).map((team) => {
    const teamId = finiteNumber(team.id);
    const location = typeof team.location === "string" ? team.location.trim() : "";
    const nickname = typeof team.nickname === "string" ? team.nickname.trim() : "";
    const ownerId = Array.isArray(team.owners) ? String(team.owners[0] ?? "") : "";
    const member = membersById.get(ownerId);
    const displayName = member && typeof member.displayName === "string" ? member.displayName : undefined;

    return FantasyTeamSchema.parse({
      teamId,
      name: (typeof team.name === "string" ? team.name.trim() : "")
        || `${location} ${nickname}`.trim() || `Team ${teamId ?? "unknown"}`,
      ...(typeof team.abbrev === "string" && team.abbrev ? { abbreviation: team.abbrev } : {}),
      ...(displayName ? { owner: displayName } : {})
    });
  });
}
