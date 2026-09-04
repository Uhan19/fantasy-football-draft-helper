const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const pages = { overview: "Overview", board: "Draft board", players: "Available players", rosters: "Team rosters", connections: "Connections & logs" };
const position = (player) => `<span class="pos ${esc(player.position)}">${esc(player.position === "DST" ? "D/ST" : player.position)}</span>`;
const empty = (title, detail = "") => `<div class="empty"><span class="empty-icon">◇</span><strong>${esc(title)}</strong>${detail ? `<br>${esc(detail)}` : ""}</div>`;
let data, page = "overview", playerPage = 0, refreshing = false;
const activity = [], knownPicks = new Set();
let lastWarning = "", lastMcpCall = "", previousConnection;
const age = (timestamp) => {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000));
  if (!Number.isFinite(seconds)) return "Unknown";
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`;
};
function log(kind, message, at = new Date().toISOString()) {
  activity.unshift({ kind, message, at });
  if (activity.length > 100) activity.length = 100;
}
function navigate() {
  const route = location.hash.slice(1);
  page = route === "logs" ? "connections" : pages[route] ? route : "overview";
  $("#page-title").textContent = pages[page];
  for (const link of document.querySelectorAll("nav a")) {
    if (link.dataset.page === page) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  for (const view of document.querySelectorAll(".view")) view.hidden = view.id !== `view-${page}`;
  render();
}
function teamName(id) { return data?.state?.teams.find((team) => team.teamId === id)?.name ?? `Team ${id ?? "—"}`; }
function availablePlayers() {
  const state = data.state;
  const drafted = new Set(state.draftedPlayerIds);
  // Preserve availability when a browser pick could not be matched to an ESPN ID.
  const names = new Set(state.picks.map((pick) => pick.player.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return state.playerCatalog.filter((player) => !drafted.has(player.espnId) && !names.has(player.name.toLowerCase().replace(/[^a-z0-9]/g, "")));
}
const rankSort = (a, b) => (a.espnRank ?? Infinity) - (b.espnRank ?? Infinity) || a.name.localeCompare(b.name);
function rosterRows(players) {
  return players.length ? players.map((player) => `<div class="roster-row"><span>${position(player)} ${esc(player.name)}</span><span class="muted">${esc(player.nflTeam ?? "—")} · BYE ${esc(player.byeWeek ?? "—")}</span></div>`).join("") : empty("Your roster starts here", "Recorded picks will appear automatically.");
}
function playerTable(players, detailed = false) {
  if (!players.length) return empty("No players to show", "Try another search or position filter.");
  return `<table><thead><tr><th>Rank</th><th>Player</th><th>Pos</th>${detailed ? "<th>NFL</th><th>Bye</th><th>Proj. points</th>" : "<th>NFL</th>"}</tr></thead><tbody>${players.map((player) => `<tr><td class="rank">${esc(player.espnRank ?? "—")}</td><td class="player-name">${esc(player.name)}${player.injuryStatus && player.injuryStatus !== "ACTIVE" ? `<span class="injury">${esc(player.injuryStatus)}</span>` : ""}</td><td>${position(player)}</td><td class="muted">${esc(player.nflTeam ?? "—")}</td>${detailed ? `<td class="muted">${esc(player.byeWeek ?? "—")}</td><td>${Number.isFinite(player.projectedPoints) ? player.projectedPoints.toFixed(1) : "—"}</td>` : ""}</tr>`).join("")}</tbody></table>`;
}
function renderOverview() {
  const { state, summary } = data, current = state.current, mine = state.teams.find((team) => team.teamId === state.user.teamId);
  const finished = state.status === "COMPLETE", available = availablePlayers().sort(rankSort);
  const metric = (label, value, note) => `<article class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`;
  $("#metrics").innerHTML = metric(finished ? "Draft complete" : "Current selection", finished ? "FINAL" : `#${current.nextOverallPick}`, finished ? `${state.picks.length} picks recorded` : `Round ${current.round} <span class="muted">/ Pick ${current.pickInRound}</span>`)
    + metric("Your next pick", finished ? "—" : state.user.nextPick ? `#${state.user.nextPick}` : "—", finished ? "Your roster is set" : state.user.picksUntilNextPick === 0 ? "You are on the clock" : state.user.picksUntilNextPick !== undefined ? `${state.user.picksUntilNextPick} picks until your turn` : "Waiting for draft order")
    + metric("Picks recorded", String(state.picks.length), current.missingPicks ? `${current.missingPicks} earlier picks missing` : "All observed selections accounted for")
    + metric("Your roster", `${state.user.currentRoster.length} <small>players</small>`, `Draft slot ${state.user.draftSlot ?? "—"} <span class="muted">/ ${state.league.teamCount} teams</span>`);
  $("#recent-picks").innerHTML = state.picks.length ? state.picks.slice(-7).reverse().map((pick) => `<div class="pick-row ${pick.fantasyTeamId === state.user.teamId ? "mine" : ""}"><div class="pick-number">${String(pick.overall).padStart(2,"0")}</div><div><div class="pick-name">${esc(pick.player.name)}</div><div class="pick-meta">${position(pick.player)} ${esc(pick.player.nflTeam ?? "")} · R${pick.round}, P${pick.pickInRound}</div></div><div class="to-team">${esc(teamName(pick.fantasyTeamId))}<span class="source-label">${pick.source === "browser" ? "BROWSER" : "ESPN API"}</span></div></div>`).join("") : empty("Waiting for the first recorded pick", "Open your ESPN draft room with the extension enabled.");
  $("#my-team-name").textContent = mine?.name ?? "My roster";
  $("#my-roster-count").textContent = `${state.user.currentRoster.length} PLAYERS`;
  $("#roster-needs").innerHTML = `<div class="needs">${Object.entries(summary.user.unfilledStarterSlots).map(([slot, count]) => `<span class="need ${count === 0 ? "filled" : ""}">${esc(slot)} ${count === 0 ? "✓" : `· ${count} open`}</span>`).join("")}</div>`;
  $("#my-roster").innerHTML = rosterRows(state.user.currentRoster);
  $("#best-available").innerHTML = `<div class="table-scroll">${playerTable(available.slice(0,6))}</div>`;
  const signal = (name, detail, good, label) => `<div class="signal"><div>${name}<small>${esc(detail)}</small></div><span class="state ${good ? "" : "warn"}"><i class="dot ${good ? "" : "warn"}"></i>${label}</span></div>`;
  $("#quick-signals").innerHTML = signal("ESPN API", `Last successful poll ${age(state.ingest.lastEspnPollAt)}`, finished || data.connections.espn, finished ? "FINAL SNAPSHOT" : data.connections.espn ? "REACHABLE" : "CHECK CONNECTION")
    + signal("Browser observer", `${state.ingest.browserDiagnostics?.detectedPicks ?? 0} visible picks · last report ${age(state.ingest.lastBrowserEventAt)}`, data.connections.browser, data.connections.browser ? "REPORTING" : "NO RECENT REPORT")
    + signal("Pick source", state.ingest.primarySource === "browser" ? "Browser picks await ESPN confirmation" : "Latest normalized picks from ESPN", !summary.freshness.stale, state.ingest.primarySource === "browser" ? "BROWSER" : "ESPN API")
    + signal("MCP client", `Last tool request ${age(data.connections.mcp.lastToolCallAt)}`, Boolean(data.connections.mcp.lastToolCallAt), data.connections.mcp.lastToolCallAt ? "TOOL USED" : "NOT YET VERIFIED");
}
function renderBoard() {
  const state = data.state, teams = [...state.teams].sort((a,b) => (a.draftSlot ?? a.teamId) - (b.draftSlot ?? b.teamId));
  const rounds = Math.min(50, state.league.draft.rounds ?? Math.max(1, state.status === "COMPLETE" ? Math.ceil(state.current.completedPicks / state.league.teamCount) : state.current.round));
  const picks = new Map(state.picks.map((pick) => [pick.overall, pick]));
  const canMap = state.league.draft.type === "SNAKE" && teams.every((team) => team.draftSlot);
  $("#board").innerHTML = canMap ? `<table class="board-table"><thead><tr><th>RND</th>${teams.map((team) => `<th>${esc(team.name)}${team.teamId === state.user.teamId ? " <span class='accent'>· YOU</span>" : ""}</th>`).join("")}</tr></thead><tbody>${Array.from({length:rounds}, (_,index) => {
    const round = index + 1;
    return `<tr><th>${String(round).padStart(2,"0")}</th>${teams.map((team) => {
      const overall = (round-1)*state.league.teamCount + (round%2 ? team.draftSlot : state.league.teamCount+1-team.draftSlot), pick = picks.get(overall);
      return `<td class="${team.teamId === state.user.teamId ? "mine " : ""}${pick ? "" : overall <= state.current.completedPicks ? "gap" : "unpicked"}"><small>#${overall} · ${round}.${String(round%2 ? team.draftSlot : state.league.teamCount+1-team.draftSlot).padStart(2,"0")}</small>${pick ? `<strong>${esc(pick.player.name)}</strong>${position(pick.player)}<span class="muted">${esc(pick.player.nflTeam ?? "")}</span>` : overall <= state.current.completedPicks ? "Not captured" : overall === state.current.nextOverallPick && state.status !== "COMPLETE" ? "On the clock" : "—"}</td>`;
    }).join("")}</tr>`;
  }).join("")}</tbody></table>` : empty("Waiting for a confirmed snake draft order", "The pick history below works for every draft type.");
  const query = $("#pick-search").value.trim().toLowerCase();
  const filtered = [...state.picks].reverse().filter((pick) => `${pick.player.name} ${teamName(pick.fantasyTeamId)} ${pick.overall}`.toLowerCase().includes(query));
  $("#pick-history").innerHTML = filtered.length ? `<table><thead><tr><th>Pick</th><th>Round</th><th>Player</th><th>Fantasy team</th><th>Source</th></tr></thead><tbody>${filtered.map((pick) => `<tr><td>#${pick.overall}</td><td class="muted">${pick.round}.${pick.pickInRound}</td><td>${position(pick.player)} ${esc(pick.player.name)}</td><td>${esc(teamName(pick.fantasyTeamId))}</td><td class="muted">${esc(pick.source)}</td></tr>`).join("")}</tbody></table>` : empty("No matching picks");
}
function renderPlayers() {
  const query = $("#player-search").value.trim().toLowerCase(), pos = $("#position-filter").value, sort = $("#player-sort").value;
  const available = availablePlayers();
  const filtered = available.filter((player) => (pos === "ALL" || player.position === pos) && `${player.name} ${player.nflTeam ?? ""}`.toLowerCase().includes(query))
    .sort(sort === "points" ? (a,b) => (b.projectedPoints ?? -Infinity)-(a.projectedPoints ?? -Infinity) || rankSort(a,b) : sort === "name" ? (a,b) => a.name.localeCompare(b.name) : rankSort);
  const totalPages = Math.max(1,Math.ceil(filtered.length/50));
  playerPage = Math.min(playerPage,totalPages-1);
  $("#available-count").textContent = `(${available.length.toLocaleString()})`;
  $("#player-list").innerHTML = playerTable(filtered.slice(playerPage*50,(playerPage+1)*50),true);
  $("#player-page").textContent = `Page ${playerPage+1} of ${totalPages} · ${filtered.length.toLocaleString()} players`;
  $("#previous-page").disabled = playerPage === 0;
  $("#next-page").disabled = playerPage === totalPages-1;
}
function renderRosters() {
  $("#all-rosters").innerHTML = data.state.teams.map((team) => `<section class="panel ${team.teamId === data.state.user.teamId ? "mine" : ""}"><div class="panel-heading"><div><p class="eyebrow">SLOT ${team.draftSlot ?? "—"}${team.teamId === data.state.user.teamId ? " · YOUR TEAM" : ""}</p><h2>${esc(team.name)}</h2></div><span class="badge">${team.players.length}</span></div><div class="needs">${Object.entries(team.positionCounts).filter(([,count]) => count>0).map(([pos,count]) => `<span class="need">${esc(pos)} ${count}</span>`).join("")}</div>${rosterRows(team.players)}</section>`).join("");
}
function renderConnections() {
  const {state,connections,config} = data, ingest = state?.ingest, diagnostic = ingest?.browserDiagnostics;
  const rows = (items) => `<dl>${items.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
  const card = (title, status, good, detail, items) => `<section class="panel connection-card"><p class="eyebrow">${title}</p><div class="status-value ${good?"":"warn"}">${esc(status)}</div><p>${esc(detail)}</p>${rows(items)}</section>`;
  $("#connections").innerHTML = `<div class="connection-grid">${card("01 / ESPN DATA",connections.espn?"API reachable":"Needs attention",connections.espn,ingest?.warning ?? data.initializationError ?? "An API connection alone does not guarantee live practice picks.",[["Configured league",config.leagueId],["Season",config.season],["Last good poll",age(ingest?.lastEspnPollAt)],["Players loaded",state?.playerCatalog.length??0],["Recorded API picks",state?.picks.filter(p=>p.source==="espn-api").length??0]])}${card("02 / BROWSER OBSERVER",connections.browser?"Reporting":"No recent report",connections.browser,"The extension reads the ESPN room. Reports expire after 30 seconds. A connection test can succeed with zero picks.",[["Fallback enabled",config.browserFallback?"Yes":"No"],["Secret configured",config.browserSecretConfigured?"Yes":"No"],["Last report",age(ingest?.lastBrowserEventAt)],["Visible / last submitted",`${diagnostic?.detectedPicks??0} / ${diagnostic?.submittedPicks??0}`],["Last batch accepted",diagnostic?.acceptedPicks??0],["Unresolved in last batch",diagnostic?.unresolved.length??0]])}${card("03 / MCP CLIENT",connections.mcp.lastToolCallAt?"Tool request received":connections.mcp.sessions?"Session initialized":"Waiting for a client",Boolean(connections.mcp.lastToolCallAt),"A tool request confirms that an MCP client read this server. The server cannot identify whether that client was ChatGPT or another app.",[["Open sessions",connections.mcp.sessions],["Last get_draft_state",age(connections.mcp.lastToolCallAt)],["MCP endpoint",`127.0.0.1:${config.port}/mcp`],["Dashboard requires tunnel","No"]])}</div>
  ${diagnostic?.unresolved.length ? `<div class="notice danger history-panel"><strong>Unresolved browser picks</strong>${diagnostic.unresolved.map((pick)=>`<p>Pick ${pick.overall}: ${esc(pick.reason)}</p>`).join("")}</div>`:""}
  <div class="panel setup-card history-panel"><h2>Connection checklist</h2><ol><li>Match <code>ESPN_LEAGUE_ID</code>, <code>ESPN_SEASON</code>, and <code>MY_TEAM_ID</code> in your local <code>.env</code> to the current room. New practice rooms can have different league IDs. Restart <code>pnpm start</code> after editing.</li><li>Load extension version <code>1.1.0</code> from <code>apps/extension/dist</code>, reload the extension in Chrome, then refresh the ESPN draft page.</li><li>In the extension popup, save your <code>BROWSER_INGEST_SECRET</code> for the browser session. Keep the ESPN pick history visible. Late joins may expose only recent selections.</li><li>Check visible picks and accepted picks above. Earlier gaps remain marked as missing until those rows are captured.</li><li>To verify your ChatGPT connection, ask it to call <code>get_draft_state</code>, then check the last tool request above. No tunnel is needed to use this dashboard.</li></ol></div>`;
  $("#activity-log").innerHTML = activity.length ? activity.map((event)=>`<div class="log-row"><time datetime="${esc(event.at)}">${esc(new Date(event.at).toLocaleTimeString([], {hour12:false}))}</time><span class="log-kind ${event.kind==="WARN"?"warn":""}">${esc(event.kind)}</span><span>${esc(event.message)}</span></div>`).join("") : empty("No activity yet");
}
function render() {
  if (!data) return;
  const {state,summary,config} = data;
  $("#league-name").textContent = state?.league.name ?? "Draft HQ.";
  $("#league-meta").textContent = `${config.season} SEASON · LEAGUE ${config.leagueId}${state?` · ${state.league.teamCount} TEAMS · ${summary.league.scoring.replaceAll("_"," ")} · ${state.league.draft.type}`:""}`;
  $("#espn-link").href = `https://fantasy.espn.com/football/draft?leagueId=${encodeURIComponent(config.leagueId)}&seasonId=${config.season}&teamId=${config.myTeamId}`;
  $("#draft-status").textContent = state?.status.replaceAll("_"," ") ?? "NOT INITIALIZED";
  $("#draft-status").className = `badge ${state?.status==="IN_PROGRESS"?"good":""}`;
  $("#draft-content").hidden = !state;
  $("#setup").hidden = Boolean(state) || page === "connections";
  $("#export").disabled = !state;
  if (!state) $("#setup").innerHTML = `<div class="panel setup-card"><p class="eyebrow">LOCAL SERVER IS RUNNING</p><h2>Let’s connect your draft.</h2><p>${esc(data.initializationError ?? "Loading league settings, teams and players from ESPN…")}</p><p>Configured league: <code>${esc(config.leagueId)}</code>. If this was an old practice room, update your <code>.env</code> with the current room’s IDs and restart <code>pnpm start</code>. This page stays available while ESPN is offline.</p><a class="button" href="#connections">View connection details →</a></div>`;
  const notices = [];
  if (state) {
    if (!data.connections.espn && state.status !== "COMPLETE") notices.push(`ESPN is unavailable or its last poll is stale. ${esc(state.ingest.warning ?? "See connections for details.")}`);
    if (state.current.missingPicks) notices.push(`<strong>${state.current.missingPicks} earlier picks were not captured.</strong> The current pick follows the latest observed selection, but rosters and availability are incomplete. Open ESPN’s Pick History so the extension can backfill visible rows.`);
    if (!state.picks.length && state.status === "IN_PROGRESS") notices.push("The draft is in progress, but no picks have been recorded. Check the browser observer’s visible and accepted counts in Connections & logs.");
    else if (summary.freshness.stale) notices.push(`Last pick change: ${state.ingest.lastStateChangeAt ? esc(age(state.ingest.lastStateChangeAt)) : "none recorded yet"}. The board may be stale; compare it with the ESPN room.`);
  }
  $("#notices").innerHTML = notices.map((message)=>`<div class="notice">${message} <a href="#connections">Connection details ↗</a></div>`).join("");
  if (state) {
    if(page==="overview") renderOverview();
    if(page==="board") renderBoard();
    if(page==="players") renderPlayers();
    if(page==="rosters") renderRosters();
  }
  if(page==="connections") renderConnections();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch("/api/dashboard", {cache:"no-store", signal:AbortSignal.timeout(5000)});
    if(!response.ok) throw new Error(`Server returned HTTP ${response.status}`);
    data = await response.json();
    if(previousConnection===false) log("SERVER","Local server reconnected");
    previousConnection = true;
    $("#offline-banner").hidden = true;
    $("#sync-status").textContent = "● Local server connected";
    $("#footer-status").textContent = `Updated ${new Date().toLocaleTimeString()} · refreshes every 2s`;
    for(const pick of data.state?.picks ?? []) {
      const key = `${data.config.leagueId}:${pick.overall}:${pick.playerId}:${pick.source}`;
      if(!knownPicks.has(key)) { knownPicks.add(key); log("PICK",`#${pick.overall} ${pick.player.name} → ${teamName(pick.fantasyTeamId)} (${pick.source})`,pick.observedAt); }
    }
    const warning = data.initializationError ?? data.state?.ingest.warning ?? "";
    if(warning && warning!==lastWarning) log("WARN",warning);
    lastWarning = warning;
    const toolAt = data.connections.mcp.lastToolCallAt;
    if(toolAt && toolAt!==lastMcpCall) {log("MCP","get_draft_state requested by an MCP client",toolAt);lastMcpCall=toolAt;}
    render();
  } catch(error) {
    if(previousConnection!==false) log("WARN","Lost connection to the local server");
    previousConnection=false;
    $("#offline-banner").hidden=false;
    $("#offline-banner").textContent=`Local server unavailable. Showing the last received data, which is no longer live. Start pnpm start and this page will reconnect. ${error.message}`;
    $("#sync-status").textContent="○ Local server offline";
    $("#footer-status").textContent="Disconnected · retrying automatically";
  } finally { refreshing=false; }
}
window.addEventListener("hashchange",navigate);
$("#refresh").addEventListener("click",refresh);
$("#pick-search").addEventListener("input",()=>{if(data?.state) renderBoard();});
for(const id of ["#player-search","#position-filter","#player-sort"]) $(id).addEventListener(id==="#player-search"?"input":"change",()=>{playerPage=0;if(data?.state)renderPlayers();});
$("#previous-page").addEventListener("click",()=>{playerPage=Math.max(0,playerPage-1);renderPlayers();});
$("#next-page").addEventListener("click",()=>{playerPage++;renderPlayers();});
$("#export").addEventListener("click",()=>{
  if(!data?.state)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(data.state,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=`draft-${data.config.leagueId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
navigate();void refresh();setInterval(()=>{void refresh();},2000);
