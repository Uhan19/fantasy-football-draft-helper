import { z } from "zod";
import type { DraftStateStore } from "../../draft/state.js";
import { selectMcpDraftState } from "../../draft/selectors.js";

export const getDraftStateInput = {
  recentPickCount: z.number().int().min(1).max(50).optional().describe("Recent picks to include (default 15)"),
  availablePlayerCount: z.number().int().min(1).max(200).optional().describe("Available players to include (default 80)")
};

export function getDraftState(store: DraftStateStore, input: {
  recentPickCount?: number;
  availablePlayerCount?: number;
}) {
  return selectMcpDraftState(store.get(), input);
}
