import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ServerResponse } from "node:http";
import type { AppConfig } from "../config.js";
import { projectRoot } from "../config.js";
import type { DraftState } from "@war-room/shared";
import { selectMcpDraftState } from "../draft/selectors.js";

const assets: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/ui": ["index.html", "text/html; charset=utf-8"],
  "/ui/": ["index.html", "text/html; charset=utf-8"],
  "/assets/dashboard.css": ["dashboard.css", "text/css; charset=utf-8"],
  "/assets/dashboard.js": ["dashboard.js", "text/javascript; charset=utf-8"]
};

export async function serveDashboard(pathname: string, response: ServerResponse): Promise<boolean> {
  const asset = assets[pathname];
  if (!asset) return false;
  const body = await readFile(resolve(projectRoot, "apps/server/public", asset[0]));
  response.writeHead(200, {
    "Content-Type": asset[1], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
    "Referrer-Policy": "no-referrer"
  });
  response.end(body);
  return true;
}

export function dashboardData(config: AppConfig, state: DraftState | undefined,
  mcp: { sessions: number; lastToolCallAt?: string }, initializationError?: string) {
  const now = Date.now();
  const pollAt = state?.ingest.lastEspnPollAt;
  const pollRecent = Boolean(pollAt && now - Date.parse(pollAt) < Math.max(config.idlePollMs * 3, 30_000));
  return {
    generatedAt: new Date(now).toISOString(),
    initialized: Boolean(state),
    initializationError,
    config: { leagueId: config.leagueId, season: config.season, myTeamId: config.myTeamId,
      browserFallback: config.browserFallback, browserSecretConfigured: Boolean(config.browserIngestSecret), port: config.port },
    connections: { server: true, espn: Boolean(state?.ingest.apiHealthy && pollRecent),
      browser: Boolean(state?.ingest.browserConnected), mcp },
    state,
    summary: state ? selectMcpDraftState(state, { recentPickCount: 50, availablePlayerCount: 200 }) : undefined
  };
}
