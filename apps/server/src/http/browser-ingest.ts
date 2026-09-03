import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DraftStateStore } from "../draft/state.js";
import { normalizeBrowserPayload } from "../ingestion/browser-events.js";
import { sendJson } from "./response.js";

function secretMatches(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body exceeds 1 MB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handleBrowserIngest(
  request: IncomingMessage,
  response: ServerResponse,
  store: DraftStateStore,
  expectedSecret: string
): Promise<void> {
  const actualSecret = Array.isArray(request.headers["x-draft-secret"])
    ? request.headers["x-draft-secret"][0]
    : request.headers["x-draft-secret"];
  if (!secretMatches(expectedSecret, actualSecret)) {
    sendJson(response, 401, { error: "Invalid browser ingestion secret" });
    return;
  }
  try {
    const body = await readJson(request);
    const result = normalizeBrowserPayload(body, store.get());
    store.applyBrowserPicks(result.picks);
    sendJson(response, 202, {
      accepted: result.picks.length,
      unresolved: result.unresolved
    });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "Invalid browser event"
    });
  }
}
