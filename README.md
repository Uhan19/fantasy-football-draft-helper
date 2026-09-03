# ESPN Fantasy Draft War Room MCP

A local-first, read-only bridge from an ESPN Fantasy Football draft to ChatGPT. It polls ESPN's unofficial fantasy endpoints, normalizes the live draft into deterministic state, and exposes one MCP tool: `get_draft_state`.

The project never drafts a player or changes ESPN state. ESPN session cookies stay in the local Node process and are never included in MCP, REST, extension, or log output.

## What V1 includes

- ESPN league settings, team metadata, draft detail, and player catalog adapters
- Public leagues and private leagues authenticated with `espn_s2` + `SWID`
- Defensive parsing and exponential poll backoff
- Snake-draft turns, current pick, user next/following picks, and intervening teams
- Per-team rosters and position counts
- Ranked available-player pool and chronological recent picks
- API/browser reconciliation with ESPN IDs taking precedence
- Streamable HTTP MCP with a single read-only tool
- Local debug endpoints and a JSON snapshot
- Manifest V3 ESPN draft-room observer fallback
- Fixture-only unit/integration tests and a mock draft simulator

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- An ESPN league ID and your ESPN fantasy team ID
- For a private league only: current `espn_s2` and `SWID` cookie values

## Install and configure

```bash
pnpm install
cp .env.example .env
openssl rand -hex 32
```

Put the generated random value in both `BROWSER_INGEST_SECRET` in `.env` and, after loading the extension, its popup. The extension stores it in `chrome.storage.session`, so it is cleared with the browser session. It is never compiled into the extension.

Configure `.env`:

```dotenv
ESPN_LEAGUE_ID=12345678
ESPN_SEASON=2026
MY_TEAM_ID=7

# Leave blank for a public league.
ESPN_S2=
ESPN_SWID=

BROWSER_INGEST_SECRET=<random-value-from-openssl>
```

Treat `ESPN_S2` like a password. Do not paste it into ChatGPT, commit it, place it in the extension, or expose it through a tunnel.

## Prove ESPN connectivity before draft day

```bash
pnpm probe:espn
```

This confirms the configured league, authentication, `mDraftDetail`, teams, and the player catalog without printing cookies. During a mock draft, watch whether pick counts change. If the browser observer sees a pick but the ESPN API does not catch up within about five seconds, state freshness reports that browser fallback is active.

ESPN's fantasy API is unofficial and can change. Every ESPN-specific assumption is isolated under `apps/server/src/espn`.
The adapter targets ESPN's current read host, `lm-api-reads.fantasy.espn.com`; the older
`fantasy.espn.com` host now commonly redirects API requests to an HTML page.

## Start the local server and MCP

```bash
pnpm start
```

Development mode:

```bash
pnpm dev
```

The process binds only to `127.0.0.1` and serves:

| Endpoint | Purpose |
| --- | --- |
| `POST/GET/DELETE /mcp` | MCP Streamable HTTP transport |
| `GET /health` | Process, ESPN, and initialization health |
| `GET /debug/state` | Full normalized state |
| `GET /debug/picks` | Normalized pick sequence |
| `GET /debug/espn` | Non-secret ESPN health metadata |
| `POST /internal/browser/picks` | Secret-protected extension ingest |

`pnpm mcp` is an alias for the same server because ESPN polling and MCP must share one in-memory state store.

## Test without waiting for draft day

```bash
pnpm simulate:draft
```

The simulator starts the same HTTP/MCP surface and sends one fake pick through the same reducer approximately every two seconds. Use a different port if the real server is running:

```bash
PORT=8788 pnpm simulate:draft
```

## Browser fallback

Build and load the extension:

```bash
pnpm --filter @war-room/extension build
```

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select `apps/extension/dist`.
4. Open only the ESPN Fantasy Football draft room for the configured league.
5. Open the extension popup and enter the same `BROWSER_INGEST_SECRET` as `.env`.
6. Confirm the popup shows the draft page and observer as active.

The extension observes only already-rendered draft rows. It does not read ESPN cookies, inject UI, inspect unrelated sites, or submit picks. ESPN DOM selectors live in one file (`apps/extension/src/selectors.ts`) so markup changes are easy to repair.

## Connect ChatGPT privately

ChatGPT needs a remote MCP connection; do not expose the credential-bearing local server on a public port. Use OpenAI's [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), which makes an outbound-only connection and forwards MCP traffic to localhost.

1. Create a tunnel in the OpenAI Platform tunnel settings and associate it with the ChatGPT workspace/account that will use it.
2. Download the current `tunnel-client` release from the Platform page.
3. Run `tunnel-client help quickstart`, then initialize an HTTP profile for `http://127.0.0.1:8787/mcp` with your `tunnel_id` and runtime API key.
4. Run `tunnel-client doctor --profile espn-war-room --explain`.
5. Keep `tunnel-client run --profile espn-war-room` running alongside `pnpm start`.
6. In ChatGPT developer mode, create an app, choose **Tunnel** as the connection, select the tunnel, and verify that it discovers only `get_draft_state`.

The tunnel is appropriate for private developer-mode use; it does not make this a publicly distributed plugin. Current setup and permission details are maintained in the [official OpenAI tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Suggested project/chat instruction:

```text
You are my live fantasy football draft strategist. Whenever a question depends on
the current draft board, call get_draft_state before answering. Warn me immediately
if freshness is stale. When I am on the clock, lead with TAKE, then three NEXT options,
then a 1–3 sentence WHY. Consider value, current news, roster construction, tier drops,
positional runs, and the probability a player survives to my following pick.
```

## MCP response

`get_draft_state` accepts optional `recentPickCount` (1–50, default 15) and `availablePlayerCount` (1–200, default 80). It returns:

- source, API/browser health, seconds since the last change, and a stale warning
- league scoring, starters, and draft type
- current round, pick, and team on the clock
- user roster, counts, unfilled starter slots, and next/following picks
- teams drafting between the user's next and following selections
- every other roster with position counts
- recent picks and top available players

All MCP annotations declare the tool read-only, non-destructive, idempotent, and closed-world.

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```

Tests use sanitized files under `fixtures/`; they never need ESPN credentials or network access.

## Pre-draft checklist

- [ ] Run `pnpm install`, `pnpm test`, and `pnpm build`.
- [ ] Refresh private-league ESPN cookies in `.env` if necessary.
- [ ] Confirm `MY_TEAM_ID`; the server deliberately refuses to guess.
- [ ] Run `pnpm probe:espn` and confirm settings, teams, draft detail, and players.
- [ ] Run a mock draft and verify the ESPN pick count updates.
- [ ] If needed, load the built extension and set its session-only ingest secret.
- [ ] Start `pnpm start` and confirm `http://127.0.0.1:8787/health`.
- [ ] Start Secure MCP Tunnel and run its `doctor` check.
- [ ] In ChatGPT, verify `get_draft_state` returns a fresh board before the real draft.

## Security boundaries

- The server binds only to `127.0.0.1`; `HOST=0.0.0.0` is rejected by config validation.
- ESPN cookies are used only in outbound ESPN request headers.
- Browser ingest requires a timing-safe secret check and validates payloads with Zod.
- Extension CORS accepts only Chrome extension or ESPN origins.
- ESPN adapters cannot fetch caller-provided URLs.
- `.env`, snapshots, logs, build output, and dependencies are ignored by Git.
- Failures retain the last valid draft state and surface staleness instead of claiming it is live.

## Non-goals

No auto-drafting, recommendation engine, ESPN write operation, lineup/waiver/trade action, user account, cloud database, or ranking model is included.
