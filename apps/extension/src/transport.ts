import type { ObservedPick } from "./parser.js";

export interface BrowserPickPayload {
  leagueId: string;
  observedAt: string;
  picks: ObservedPick[];
}

export async function sendPicks(payload: BrowserPickPayload): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: "INGEST_PICKS", payload });
  if (!response?.ok) throw new Error(response?.error ?? "Local server unavailable");
}
