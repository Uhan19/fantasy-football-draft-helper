import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { startHttpServer } from "../src/http/server.js";
import { DraftStateStore } from "../src/draft/state.js";
import { fixtureContext } from "./helpers.js";
import type { AppConfig } from "../src/config.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});
const config: AppConfig = { host: "127.0.0.1", port: 0, leagueId: "12345678", season: 2026, myTeamId: 1,
  activePollMs: 2000, idlePollMs: 10000, browserFallback: true,
  browserIngestSecret: "test-ingest-secret", espnS2: "test-espn-cookie", espnSwid: "test-swid", snapshotPath: "/unused" };
async function start(store?: DraftStateStore) {
  const server = await startHttpServer(config, () => store, () => "ESPN returned HTTP 404");
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
describe("local dashboard and ingestion integration", () => {
  it("serves the dashboard during initialization failure, without exposing secrets", async () => {
    const url = await start();
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(await response.text()).toContain("Draft HQ");
    const api = await fetch(`${url}/api/dashboard`), text = await api.text();
    expect(JSON.parse(text)).toMatchObject({ initialized: false, initializationError: "ESPN returned HTTP 404" });
    for (const secret of [config.browserIngestSecret, config.espnS2, config.espnSwid]) expect(text).not.toContain(secret);
    expect((await fetch(`${url}/debug/state`)).status).toBe(503);
    expect((await fetch(`${url}/assets/dashboard.js`)).status).toBe(200);
  });

  it("ingests partial history, returns rejected indices, and exposes the same picks to UI and MCP", async () => {
    const context = await fixtureContext(), store = new DraftStateStore({ ...context, myTeamId: 1 });
    const url = await start(store);
    const body = { leagueId: context.league.leagueId, observedAt: new Date().toISOString(),
      diagnostics: { detectedPicks: 2, observerActive: true }, picks: [
        { round: 2, pickInRound: 1, playerName: "Alpha Runner", fantasyTeamName: context.teams[0]!.name },
        { round: 2, pickInRound: 2, playerName: "Beta", fantasyTeamName: "Unknown" }
      ] };
    const post = (secret: string) => fetch(`${url}/internal/browser/picks`, {method:"POST",
      headers:{"Content-Type":"application/json","X-Draft-Secret":secret},body:JSON.stringify(body)});
    expect((await post("wrong")).status).toBe(401);
    const response = await post(config.browserIngestSecret!);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: 1, acceptedIndices: [0], unresolved: [{ index: 1, overall: 6 }] });
    const dashboard = await (await fetch(`${url}/api/dashboard`)).json();
    expect(dashboard.state.current).toMatchObject({nextOverallPick:6, recordedPicks:1, missingPicks:4});
    expect(dashboard.state.ingest.browserDiagnostics).toMatchObject({ detectedPicks: 2, acceptedPicks: 1 });
    const client = new Client({name:"dashboard-test",version:"1.0.0"});
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));
      const result = await client.callTool({name:"get_draft_state",arguments:{}});
      expect(JSON.stringify(result)).toContain("Alpha Runner");
      const after = await (await fetch(`${url}/api/dashboard`)).json();
      expect(after.connections.mcp.lastToolCallAt).toBeTruthy();
      expect(after.connections.mcp.sessions).toBe(1);
    } finally { await client.close(); }
  });
});
