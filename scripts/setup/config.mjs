import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadSettings(root) {
  try { return parseEnv(await readFile(join(root, '.env'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

export function draftSelection(input) {
  if (!input || typeof input !== 'object') throw new Error('Enter your ESPN draft-room link.');
  let leagueId = String(input.leagueId ?? '').trim();
  let season = String(input.season ?? new Date().getFullYear()).trim();
  let myTeamId = String(input.teamId ?? '').trim();
  const link = String(input.draftUrl ?? '').trim();
  if (link) {
    let url;
    try { url = new URL(link); } catch { throw new Error('Copy the full link from your ESPN draft room.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'fantasy.espn.com') {
      throw new Error('Use a link beginning with https://fantasy.espn.com/.');
    }
    leagueId = url.searchParams.get('leagueId') ?? leagueId;
    season = url.searchParams.get('seasonId') ?? season;
    myTeamId = url.searchParams.get('teamId') ?? myTeamId;
  }
  if (!/^\d{1,20}$/.test(leagueId)) throw new Error('The ESPN link needs a league ID.');
  if (!/^\d{4}$/.test(season) || +season < 2000 || +season > 2100) throw new Error('Enter a season between 2000 and 2100.');
  if (!/^\d{1,5}$/.test(myTeamId) || +myTeamId < 1 || +myTeamId > 10000) {
    throw new Error('The ESPN link needs your team ID. Open your own draft room and copy its full link, or enter the team ID below.');
  }
  return { leagueId, season: +season, myTeamId: +myTeamId };
}

export function updateSettings(current, input) {
  const selection = draftSelection(input);
  const next = { HOST: '127.0.0.1', PORT: '8787', DRAFT_POLL_INTERVAL_MS: '2000',
    IDLE_POLL_INTERVAL_MS: '10000', ENABLE_BROWSER_FALLBACK: 'true',
    SNAPSHOT_PATH: './data/draft-state.json', ...current,
    ESPN_LEAGUE_ID: selection.leagueId, ESPN_SEASON: String(selection.season), MY_TEAM_ID: String(selection.myTeamId) };
  for (const [field, key] of [['espnS2', 'ESPN_S2'], ['swid', 'ESPN_SWID'], ['runtimeKey', 'CONTROL_PLANE_API_KEY'], ['tunnelId', 'CONTROL_PLANE_TUNNEL_ID']]) {
    const value = String(input[field] ?? '').trim();
    if (value) {
      if (/[\r\n\0]/.test(value) || value.length > 16000) throw new Error('Paste each credential as one line.');
      next[key] = value;
    }
  }
  if (input.clearEspn === true) { delete next.ESPN_S2; delete next.ESPN_SWID; }
  if (Boolean(next.ESPN_S2) !== Boolean(next.ESPN_SWID)) throw new Error('Private ESPN leagues need both ESPN cookies. Fill both fields, or keep both existing values.');
  if (next.CONTROL_PLANE_TUNNEL_ID && !/^tunnel_[a-zA-Z0-9]+$/.test(next.CONTROL_PLANE_TUNNEL_ID)) {
    throw new Error('The tunnel ID starts with tunnel_. It is different from the secret API key.');
  }
  next.BROWSER_INGEST_SECRET ||= randomBytes(32).toString('hex');
  // This setup manager always starts the server on loopback; it never exposes it publicly.
  next.HOST = '127.0.0.1';
  return next;
}

export function serializeSettings(settings) {
  return '# War Room settings. Keep this file private; setup never sends these values back to the browser.\n' +
    Object.entries(settings).map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error('An existing setting has an invalid name.');
      // parseEnv and dotenv both support literal quoted values. Preserve $, # and backslashes.
      const quote = !value.includes("'") ? "'" : !value.includes('"') ? '"' : !value.includes('`') ? '`' : null;
      if (!quote) throw new Error('An existing setting contains unsupported quoting; edit that setting in .env first.');
      return `${key}=${quote}${value}${quote}`;
    }).join('\n') + '\n';
}

export async function saveSettings(root, settings) {
  const path = join(root, '.env'), temporary = path + '.setup-tmp';
  const text = serializeSettings(settings);
  await writeFile(temporary, text, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

export function publicSettings(settings, selection) {
  return { leagueId: selection?.leagueId ?? settings.ESPN_LEAGUE_ID ?? '',
    season: selection?.season ?? settings.ESPN_SEASON ?? new Date().getFullYear(),
    teamId: selection?.myTeamId ?? settings.MY_TEAM_ID ?? '',
    cookiesSaved: Boolean(settings.ESPN_S2 && settings.ESPN_SWID),
    runtimeKeySaved: Boolean(settings.CONTROL_PLANE_API_KEY),
    tunnelId: settings.CONTROL_PLANE_TUNNEL_ID ?? '' };
}

export function tunnelArguments(settings, port) {
  if (!settings.CONTROL_PLANE_API_KEY) throw new Error('Add your OpenAI runtime API key under Connect your assistant, then save.');
  if (!/^tunnel_[a-zA-Z0-9]+$/.test(settings.CONTROL_PLANE_TUNNEL_ID ?? '')) throw new Error('Add the tunnel ID from OpenAI Platform, then save.');
  return ['run', '--control-plane.tunnel-id', settings.CONTROL_PLANE_TUNNEL_ID,
    '--control-plane.api-key', 'env:CONTROL_PLANE_API_KEY',
    '--mcp.server-url', `url=http://127.0.0.1:${port}/mcp`, '--log.level', 'warn'];
}
