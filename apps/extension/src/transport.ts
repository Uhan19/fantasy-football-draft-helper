import type { ObservedPick } from "./parser.js";

export interface BrowserPickPayload {
  leagueId: string;
  observedAt: string;
  picks: ObservedPick[];
  diagnostics: { detectedPicks: number; observerActive: boolean };
}

export interface IngestResult {
  accepted: number;
  acceptedIndices: number[];
  unresolved: Array<{ index: number; overall: number; reason: string }>;
}

export async function sendPicks(payload: BrowserPickPayload): Promise<IngestResult> {
  const response = await chrome.runtime.sendMessage({ type: "INGEST_PICKS", payload });
  if (!response?.ok) throw new Error(response?.error ?? "Local server unavailable");
  if (!Array.isArray(response.acceptedIndices)) throw new Error("Restart the local server to load the updated ingestion endpoint");
  return response as IngestResult;
}
