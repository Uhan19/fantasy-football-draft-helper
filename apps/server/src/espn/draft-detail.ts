import { z } from "zod";
import type { ParsedDraftDetail, ParsedDraftPick } from "./types.js";

const PickSchema = z
  .object({
    // ESPN pre-populates future draft slots with playerId: -1. Only positive
    // player IDs represent completed selections.
    playerId: z.number().int().positive(),
    teamId: z.number().int().positive(),
    overallPickNumber: z.number().int().positive(),
    roundId: z.number().int().positive(),
    roundPickNumber: z.number().int().positive()
  })
  .passthrough();

const DraftSlotSchema = z
  .object({
    teamId: z.number().int().positive(),
    roundId: z.number().int().positive(),
    roundPickNumber: z.number().int().positive()
  })
  .passthrough();

const RootSchema = z
  .object({
    draftDetail: z
      .object({
        drafted: z.boolean().optional(),
        inProgress: z.boolean().optional(),
        picks: z.array(z.unknown()).optional(),
        pickOrder: z.array(z.number().int().positive()).optional(),
        draftOrder: z.array(z.number().int().positive()).optional()
      })
      .passthrough()
  })
  .passthrough();

export function parseDraftDetail(input: unknown): ParsedDraftDetail {
  const root = RootSchema.parse(input);
  const detail = root.draftDetail;
  const picks: ParsedDraftPick[] = [];
  for (const raw of detail.picks ?? []) {
    const parsed = PickSchema.safeParse(raw);
    if (parsed.success) picks.push(parsed.data);
  }
  picks.sort((left, right) => left.overallPickNumber - right.overallPickNumber);

  const order = detail.pickOrder ?? detail.draftOrder ?? [];
  const draftSlotByTeamId: Record<number, number> = {};
  order.forEach((teamId, index) => {
    draftSlotByTeamId[teamId] = index + 1;
  });
  // Some leagues omit pickOrder but include the scheduled first-round slots as
  // playerId: -1 placeholders. Preserve only their team/slot assignment.
  for (const raw of detail.picks ?? []) {
    const slot = DraftSlotSchema.safeParse(raw);
    if (slot.success && slot.data.roundId === 1) {
      draftSlotByTeamId[slot.data.teamId] ??= slot.data.roundPickNumber;
    }
  }

  return {
    drafted: detail.drafted ?? false,
    inProgress: detail.inProgress ?? false,
    picks,
    draftSlotByTeamId
  };
}
