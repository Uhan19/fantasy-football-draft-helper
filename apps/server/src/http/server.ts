import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../config.js";
import type { DraftStateStore } from "../draft/state.js";
import { createWarRoomMcpServer } from "../mcp/server.js";
import { handleBrowserIngest } from "./browser-ingest.js";
import { sendJson } from "./response.js";
import { dashboardData, serveDashboard } from "./dashboard.js";
import { LeagueSelectionSchema, type LeagueSelection } from "../league-selection.js";

interface LeagueControls {
  switchLeague: (selection: LeagueSelection) => Promise<void>;
  isSwitching: () => boolean;
}

interface JsonRpcBody {
  method?: unknown;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body exceeds 1 MB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRpcBody;
}

function applyBrowserCors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const allowed = origin.startsWith("chrome-extension://") || origin === "https://fantasy.espn.com";
  if (!allowed) return false;
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Draft-Secret");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return true;
}

export async function startHttpServer(config: AppConfig,
  source: DraftStateStore | (() => DraftStateStore | undefined),
  initializationError: () => string | undefined = () => undefined,
  leagueControls?: LeagueControls) {
  const getStore = () => typeof source === "function" ? source() : source;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  let lastToolCallAt: string | undefined;

  async function handleMcp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const store = getStore();
    if (!store) { sendJson(response, 503, { error: "ESPN league is not initialized. Check the local dashboard." }); return; }
    const sessionIdHeader = request.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    let transport = sessionId ? transports.get(sessionId) : undefined;
    let body: unknown;

    if (request.method === "POST") {
      try {
        body = await readBody(request);
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
        return;
      }
    }

    if (!transport && request.method === "POST" && isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        }
      });
      transport.onclose = () => {
        if (transport?.sessionId) transports.delete(transport.sessionId);
      };
      const mcpServer = createWarRoomMcpServer(getStore, () => { lastToolCallAt = new Date().toISOString(); });
      await mcpServer.connect(transport);
    }

    if (!transport) {
      sendJson(response, 400, { error: "Missing or invalid MCP session" });
      return;
    }
    await transport.handleRequest(request, response, body);
  }

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${config.host}:${config.port}`);
      const store = getStore();
      if (request.method === "GET" && await serveDashboard(url.pathname, response)) return;
      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        response.setHeader("Cache-Control", "no-store");
        sendJson(response, 200, { ...dashboardData(config, store?.get(), {
          sessions: transports.size, lastToolCallAt
        }, initializationError()), leagueSelection: {
          enabled: Boolean(leagueControls), switching: leagueControls?.isSwitching() ?? false
        } });
        return;
      }
      if (url.pathname === "/api/league") {
        if (request.method !== "POST") { sendJson(response, 405, { error: "Use POST to connect a league" }); return; }
        const port = typeof server.address() === "object" ? (server.address() as { port: number }).port : config.port;
        const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
        const origin = request.headers.origin;
        if (!allowedHosts.includes(request.headers.host ?? "")
          || (origin && !allowedHosts.some((host) => origin === `http://${host}`))
          || request.headers["sec-fetch-site"] === "cross-site"
          || request.headers["x-war-room-request"] !== "1") {
          sendJson(response, 403, { error: "Change leagues from the local dashboard" }); return;
        }
        if (!leagueControls) { sendJson(response, 409, { error: "League switching is unavailable in the draft simulator. Open your real dashboard on port 8787." }); return; }
        if (leagueControls.isSwitching()) { sendJson(response, 409, { error: "A league connection is already in progress" }); return; }
        const parsed = LeagueSelectionSchema.safeParse(await readBody(request).catch(() => undefined));
        if (!parsed.success) { sendJson(response, 400, { error: "Enter a numeric league ID, a season from 2000–2100, and a positive team ID" }); return; }
        try {
          await leagueControls.switchLeague(parsed.data);
          lastToolCallAt = undefined;
          sendJson(response, 200, { ok: true, selection: parsed.data });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to connect to this league";
          sendJson(response, 422, { error: message.includes("404")
            ? "ESPN could not find that league. Check the league ID and season, or paste a fresh practice-room URL. Your previous selection is unchanged."
            : `${message}. Your previous selection is unchanged.` });
        }
        return;
      }
      if (url.pathname === "/mcp") {
        await handleMcp(request, response);
        return;
      }
      if (url.pathname === "/health" && request.method === "GET") {
        const state = store?.get();
        sendJson(response, 200, {
          ok: true,
          espn: state?.ingest.apiHealthy ?? false,
          draftStateInitialized: Boolean(store)
        });
        return;
      }
      if (!store) {
        sendJson(response, 503, { error: initializationError() ?? "Waiting for ESPN league data" });
        return;
      }
      if (url.pathname === "/debug/state" && request.method === "GET") {
        sendJson(response, 200, store.get());
        return;
      }
      if (url.pathname === "/debug/picks" && request.method === "GET") {
        sendJson(response, 200, store.get().picks);
        return;
      }
      if (url.pathname === "/debug/espn" && request.method === "GET") {
        const state = store.get();
        sendJson(response, 200, {
          apiHealthy: state.ingest.apiHealthy,
          lastEspnPollAt: state.ingest.lastEspnPollAt,
          status: state.status,
          completedPicks: state.current.completedPicks,
          loadedPlayers: state.playerCatalog.length
        });
        return;
      }
      if (url.pathname === "/internal/browser/picks") {
        if (leagueControls?.isSwitching()) { sendJson(response, 409, { error: "Connecting a league; the extension will retry shortly" }); return; }
        if (!applyBrowserCors(request, response)) {
          sendJson(response, 403, { error: "Origin not allowed" });
          return;
        }
        if (request.method === "OPTIONS") {
          response.writeHead(204);
          response.end();
          return;
        }
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed" });
          return;
        }
        if (!config.browserFallback || !config.browserIngestSecret) {
          sendJson(response, 404, { error: "Browser fallback is disabled" });
          return;
        }
        await handleBrowserIngest(
          request,
          response,
          store,
          config.browserIngestSecret
        );
        return;
      }
      sendJson(response, 404, { error: "Not found" });
    })().catch((error) => {
      console.error("HTTP request failed", {
        message: error instanceof Error ? error.message : "unknown error"
      });
      if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
      else response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });
  server.on("close", () => { for (const transport of transports.values()) void transport.close(); });
  console.log(`✓ Draft dashboard: http://${config.host}:${config.port}/`);
  console.log(`✓ Local MCP endpoint: http://${config.host}:${config.port}/mcp`);
  return server;
}
