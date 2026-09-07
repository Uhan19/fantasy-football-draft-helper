import { createServer } from 'node:http';
import { readFile, access, mkdir, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadSettings, updateSettings, saveSettings, publicSettings, tunnelArguments, draftSelection } from './setup/config.mjs';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = { '/': ['index.html', 'text/html'], '/setup.js': ['setup.js', 'text/javascript'], '/setup.css': ['setup.css', 'text/css'] };
export function validLocalRequest(req, port, token, mutation = false) {
  const host = req.headers.host;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(host) || req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin && !hosts.some(h => req.headers.origin === `http://${h}`)) return false;
  return !mutation || req.headers['x-war-room-setup'] === token;
}
async function jsonBody(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 64000) throw new Error('The setup form is too large.'); }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('The setup form could not be read. Reload the page and try again.'); }
}
async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(2500) });
    return response.ok ? await response.json() : undefined;
  } catch { return undefined; }
}
function launch(command, args, options = {}) {
  return spawn(command, args, { stdio: 'ignore', ...options });
}
function openBrowser(url) {
  const child = launch('open', [url]);
  child.on('error', () => console.log('Open this link in your browser: ' + url));
}
async function executable(name, localRoot) {
  if (localRoot && name === 'tunnel-client') {
    const bundled = join(localRoot, 'tools/tunnel-client');
    try { await access(bundled, constants.X_OK); return bundled; } catch {}
  }
  const paths = [...new Set([...(process.env.PATH ?? '').split(':'), '/opt/homebrew/bin', '/usr/local/bin'])];
  for (const dir of paths) {
    if (!dir) continue;
    const file = join(dir, name);
    try { await access(file, constants.X_OK); return file; } catch {}
  }
}
export async function createSetup({ root = projectRoot, port = 8786, run = launch, findExecutable = executable } = {}) {
  const token = randomBytes(24).toString('hex');
  let serverChild, tunnelChild, installChild, busy = false, message = '', selectionOverride;
  let closing = false, messageError = false;
  async function settings() { return loadSettings(root); }
  async function serverInfo() {
    const env = await settings(), port = Number(env.PORT || 8787);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('The saved server port is invalid. Set PORT to 8787 in .env.');
    const url = `http://127.0.0.1:${port}`;
    const data = await fetchJson(url + '/api/dashboard');
    return { env, port, url, data: data?.config && data?.connections ? data : undefined };
  }
  async function dependenciesReady() {
    try { await access(join(root, 'apps/server/node_modules/tsx/package.json')); return true; } catch { return false; }
  }
  function track(child, kind) {
    const fail = () => { if (!closing) message = kind === 'tunnel'
      ? 'The assistant connection stopped. Check the saved key, tunnel ID, and your OpenAI Tunnels Read + Use access; also check that another tunnel is not already using port 8080.'
      : 'The draft server stopped. Check your saved settings and restart it. For more details, run pnpm start from this folder.'; };
    child.on('error', fail);
    child.on('close', (code) => {
      if (kind === 'tunnel' && tunnelChild === child) { tunnelChild = undefined; if (code) fail(); }
      if (kind === 'server' && serverChild === child) { serverChild = undefined; if (code) fail(); }
    });
    return child;
  }
  async function stop(child) {
    if (!child || child.exitCode !== null) return;
    await new Promise(resolve => {
      child.once('exit', resolve);
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
      timer.unref();
      child.once('exit', () => clearTimeout(timer));
      child.kill('SIGTERM');
    });
  }
  async function startServer() {
    const info = await serverInfo();
    if (info.data) { message = 'Your draft server is already running. Open the dashboard below.'; return; }
    if (!await dependenciesReady()) throw new Error('Click Install required files first.');
    const saved = publicSettings(info.env, selectionOverride);
    draftSelection(saved);
    if (!serverChild) serverChild = track(run(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: join(root, 'apps/server'), env: { ...process.env, ...info.env, HOST: '127.0.0.1' }
    }), 'server');
    message = 'Starting the draft server. ESPN may take a few seconds to respond.';
  }
  async function install() {
    const npm = await findExecutable('npm');
    if (!npm) throw new Error('Install Node.js LTS from nodejs.org, then reopen Start War Room.command.');
    message = 'Installing required files. This can take a few minutes; keep this window open.';
    await new Promise((resolve, reject) => {
      installChild = run(npm, ['exec', '--yes', '--package=pnpm@9.2.0', '--', 'pnpm', 'install', '--frozen-lockfile'], { cwd: root });
      installChild.once('error', () => reject(new Error('The installer could not start. Reinstall Node.js LTS, then try again.')));
      installChild.once('exit', code => code === 0 ? resolve() : reject(new Error('Installation did not finish. Check your internet connection and folder permissions, then try again.')));
    });
    installChild = undefined;
    message = 'Required files installed. Save your draft settings, then start War Room.';
  }
  async function action(kind, input) {
    if (kind === 'install') return install();
    if (kind === 'save') {
      const info = await serverInfo();
      if (info.data && !serverChild) throw new Error('A draft server is running in another Terminal window. Stop it there before changing setup settings. You can still open its dashboard below.');
      const next = updateSettings(info.env, input);
      await stop(tunnelChild); await stop(serverChild);
      await saveSettings(root, next);
      // The runtime gives this file precedence over .env; keep both in agreement.
      const selection = draftSelection(input);
      await mkdir(join(root, 'data'), { recursive: true });
      const path = join(root, 'data/league-selection.json');
      await writeFile(path + '.setup-tmp', JSON.stringify(selection) + '\n', { mode: 0o600 });
      await rename(path + '.setup-tmp', path);
      selectionOverride = selection;
      message = 'Settings saved on this Mac. Click Start War Room when you are ready.';
      return;
    }
    if (kind === 'start') return startServer();
    if (kind === 'tunnel') {
      if (tunnelChild) { message = 'The assistant connection is already running.'; return; }
      const info = await serverInfo();
      if (!info.data?.initialized) throw new Error('Start War Room and connect your ESPN league before starting the assistant connection.');
      const binary = await findExecutable('tunnel-client', root);
      if (!binary) throw new Error('Download the Mac tunnel client from OpenAI Platform, then place the executable in this project’s tools folder as tunnel-client. The dashboard works without it.');
      const args = tunnelArguments(info.env, info.port);
      tunnelChild = track(run(binary, args, { cwd: root, env: { ...process.env, ...info.env } }), 'tunnel');
      message = 'Assistant connection started. Ask your connected assistant to read the draft; a received tool request confirms the full connection.';
      return;
    }
    if (kind === 'stop') {
      await stop(tunnelChild); await stop(serverChild);
      message = 'Stopped the programs started by this setup window. You can start them again here.';
      return;
    }
    throw new Error('Choose one of the setup buttons.');
  }
  async function status() {
    const info = await serverInfo();
    let selection;
    try { selection = JSON.parse(await readFile(join(root, 'data/league-selection.json'), 'utf8')); } catch {}
    return { app: 'war-room-setup', token, busy, message, messageError,
      settings: publicSettings(info.env, selectionOverride ?? selection), dependenciesReady: await dependenciesReady(),
      serverRunning: Boolean(info.data), serverOwned: Boolean(serverChild), tunnelRunning: Boolean(tunnelChild),
      tunnelInstalled: Boolean(await findExecutable('tunnel-client', root)), dashboardUrl: info.url,
      espnConnected: Boolean(info.data?.connections.espn || (info.data?.state?.status === 'COMPLETE' && info.data?.state?.ingest.apiHealthy)),
      leagueName: info.data?.state?.league.name,
      // Do not forward upstream errors or snapshots: they can include private data.
      leagueInitialized: Boolean(info.data?.initialized), lastToolCallAt: info.data?.connections.mcp.lastToolCallAt };
  }
  const server = createServer((req, res) => {
    void (async () => {
      const actualPort = server.address().port;
      const url = new URL(req.url, `http://127.0.0.1:${actualPort}`);
      const send = (code, value, type = 'application/json') => {
        res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
        res.end(type === 'application/json' ? JSON.stringify(value) : value);
      };
      if (!validLocalRequest(req, actualPort, token, req.method === 'POST')) { send(403, { error: 'Open setup from Start War Room.command on this Mac.' }); return; }
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        send(200, await readFile(join(root, 'scripts/setup', file), 'utf8'), type); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') { send(200, await status()); return; }
      if (req.method === 'POST' && url.pathname === '/api/action') {
        if (busy) { send(409, { error: 'Another step is still running. Wait for it to finish.' }); return; }
        busy = true; messageError = false;
        try {
          const input = await jsonBody(req);
          await action(input.action, input.settings ?? {});
          send(200, { ok: true, message });
        } catch (error) {
          // Our controlled validation errors contain instructions, never submitted values.
          const known = error instanceof Error && !error.code;
          message = known ? error.message : 'Unable to save or start. Check that the project folder is writable and try again.';
          messageError = true;
          send(400, { error: message });
        } finally { busy = false; }
        return;
      }
      send(404, { error: 'Page not found.' });
    })().catch(() => { if (!res.headersSent) { res.writeHead(500); res.end('Setup could not complete that step. Reopen the launcher and try again.'); } else res.end(); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { server, close: async () => {
    closing = true; await stop(installChild); await stop(tunnelChild); await stop(serverChild);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  } };
}

async function main() {
  const url = 'http://127.0.0.1:8786';
  const existing = await fetchJson(url + '/api/status');
  if (existing?.app === 'war-room-setup') { openBrowser(url); return; }
  const setup = await createSetup();
  console.log('War Room setup: ' + url + '\nKeep this Terminal window open while using War Room. Press Control-C here to stop programs started by this launcher.');
  openBrowser(url);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => { void setup.close().then(() => process.exit(0)); });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.code === 'EADDRINUSE' ? 'Port 8786 is already in use. Close the other setup window and try again.' : 'Setup could not start. Use Node.js 22 or newer and reopen the launcher.'); process.exitCode = 1; });
}
