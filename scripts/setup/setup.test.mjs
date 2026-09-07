import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, cp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createSetup, projectRoot, validLocalRequest } from '../start-war-room.mjs';
import { draftSelection, updateSettings, serializeSettings, publicSettings, tunnelArguments, saveSettings, loadSettings } from './config.mjs';

const selection = { draftUrl: 'https://fantasy.espn.com/football/draft?leagueId=123&seasonId=2026&teamId=5' };
test('room links validate identity without fetching arbitrary URLs', () => {
  assert.deepEqual(draftSelection(selection), { leagueId: '123', season: 2026, myTeamId: 5 });
  assert.throws(() => draftSelection({ ...selection, draftUrl: 'https://example.com/?leagueId=123&teamId=5' }), /fantasy.espn.com/);
  assert.throws(() => draftSelection({ draftUrl: 'https://fantasy.espn.com/football/draft?leagueId=123' }), /team ID/);
});
test('saving blank secrets keeps existing credentials and unrelated settings', () => {
  const current = { ESPN_S2: 'cookie#with$characters', ESPN_SWID: '{id}', CONTROL_PLANE_API_KEY: 'private-key', CUSTOM_SETTING: 'hello world', BROWSER_INGEST_SECRET: 'existing-secret' };
  const next = updateSettings(current, selection);
  for (const [key, value] of Object.entries(current)) assert.equal(next[key], value);
  assert.deepEqual(parseEnv(serializeSettings(next)), next);
  const view = publicSettings(next);
  for (const secret of ['cookie#with$characters', '{id}', 'private-key', 'existing-secret']) assert.ok(!JSON.stringify(view).includes(secret));
  assert.equal(view.cookiesSaved, true);
  assert.equal(view.runtimeKeySaved, true);
  assert.throws(() => updateSettings({}, { ...selection, espnS2: 'one-cookie' }), /both/);
  assert.throws(() => updateSettings({}, { ...selection, runtimeKey: 'key\nEXTRA=value' }), /one line/);
  assert.equal(updateSettings(current, { ...selection, clearEspn: true }).ESPN_S2, undefined);
});
test('fresh setup creates an ingest secret and tunnel command never contains the API key', () => {
  const next = updateSettings({}, { ...selection, runtimeKey: 'secret-runtime', tunnelId: 'tunnel_123' });
  assert.equal(next.BROWSER_INGEST_SECRET.length, 64);
  const args = tunnelArguments(next, 8799);
  assert.ok(!args.join(' ').includes('secret-runtime'));
  assert.ok(args.includes('env:CONTROL_PLANE_API_KEY'));
  assert.ok(args.includes('url=http://127.0.0.1:8799/mcp'));
  assert.throws(() => tunnelArguments({}, 8787), /runtime API key/);
});
test('local setup rejects foreign origins, forged hosts and missing action tokens', () => {
  const headers = { host: '127.0.0.1:8786', origin: 'http://127.0.0.1:8786', 'x-war-room-setup': 'secret' };
  assert.equal(validLocalRequest({ headers }, 8786, 'secret', true), true);
  for (const change of [{ origin: 'https://attacker.example' }, { host: 'attacker.example:8786' }, { 'x-war-room-setup': 'wrong' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal(validLocalRequest({ headers: { ...headers, ...change } }, 8786, 'secret', true), false);
  }
});
test('settings are saved with private permissions and safely reloaded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'war-room-env-'));
  try {
    await saveSettings(root, updateSettings({}, selection));
    assert.equal((await loadSettings(root)).MY_TEAM_ID, '5');
    assert.equal((await stat(join(root, '.env'))).mode & 0o777, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('fresh browser setup saves real configuration, keeps secrets out of responses, and recovers from invalid input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'war-room-setup-'));
  await cp(join(projectRoot, 'scripts/setup'), join(root, 'scripts/setup'), { recursive: true });
  await writeFile(join(root, '.env'), 'PORT=18797\n');
  const setup = await createSetup({ root, port: 0 });
  try {
    const base = 'http://127.0.0.1:' + setup.server.address().port;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await page.text(), /Less setup/);
    const initial = await (await fetch(base + '/api/status')).json();
    assert.equal(initial.serverRunning, false);
    assert.equal(initial.dependenciesReady, false);
    const headers = { 'Content-Type': 'application/json', 'X-War-Room-Setup': initial.token };
    const post = (action, settings) => fetch(base + '/api/action', { method: 'POST', headers, body: JSON.stringify({ action, settings }) });
    assert.equal((await fetch(base + '/api/action', { method: 'POST', body: '{}' })).status, 403);
    const bad = await post('save', { ...selection, runtimeKey: 'hidden\nsecret' });
    assert.equal(bad.status, 400);
    assert.ok(!(await bad.text()).includes('hidden'));
    const good = await post('save', { ...selection, runtimeKey: 'hidden-runtime-key', tunnelId: 'tunnel_123' });
    assert.equal(good.status, 200);
    const saved = await loadSettings(root);
    assert.equal(saved.CONTROL_PLANE_API_KEY, 'hidden-runtime-key');
    assert.deepEqual(JSON.parse(await readFile(join(root, 'data/league-selection.json'), 'utf8')), { leagueId: '123', season: 2026, myTeamId: 5 });
    const status = await (await fetch(base + '/api/status')).text();
    assert.ok(!status.includes('hidden-runtime-key'));
    assert.equal(JSON.parse(status).settings.runtimeKeySaved, true);
    const start = await post('start');
    assert.equal(start.status, 400);
    assert.match((await start.json()).error, /Install required files/);
    // A new server process still discovers the saved credentials, without an export command.
    assert.equal(publicSettings(await loadSettings(root)).runtimeKeySaved, true);
  } finally { await setup.close(); await rm(root, { recursive: true, force: true }); }
});

test('launcher starts server and tunnel with saved environment, then stops only its own children', async () => {
  const { createServer } = await import('node:http');
  const { spawn } = await import('node:child_process');
  const { mkdir } = await import('node:fs/promises');
  const { once } = await import('node:events');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const serverPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const root = await mkdtemp(join(tmpdir(), 'war-room-lifecycle-'));
  await mkdir(join(root, 'apps/server/node_modules/tsx'), { recursive: true });
  await writeFile(join(root, 'apps/server/node_modules/tsx/package.json'), '{}');
  await saveSettings(root, { ...updateSettings({}, { ...selection, runtimeKey: 'test-secret', tunnelId: 'tunnel_123' }), PORT: String(serverPort) });
  const children = [], calls = [];
  const setup = await createSetup({ root, port: 0, findExecutable: async () => process.execPath,
    run: (command, args, options) => {
      calls.push({ command, args, env: options.env });
      const program = args[0] === 'run' ? 'setInterval(()=>{},1000)' : `require('node:http').createServer((q,s)=>{s.setHeader('Content-Type','application/json');s.end(JSON.stringify({config:{},connections:{espn:true,mcp:{}},initialized:true}));}).listen(${serverPort},'127.0.0.1')`;
      const child = spawn(process.execPath, ['-e', program], { stdio: 'ignore', env: options.env });
      children.push(child); return child;
    } });
  try {
    const base = 'http://127.0.0.1:' + setup.server.address().port;
    const status = () => fetch(base + '/api/status').then(r => r.json());
    const initial = await status();
    const post = action => fetch(base + '/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-War-Room-Setup': initial.token }, body: JSON.stringify({ action }) });
    assert.equal((await post('start')).status, 200);
    let current;
    for (let attempt = 0; attempt < 30; attempt++) {
      current = await status(); if (current.serverRunning) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.equal(current.serverRunning, true);
    assert.equal(current.serverOwned, true);
    assert.equal((await post('tunnel')).status, 200);
    assert.equal(calls[1].env.CONTROL_PLANE_API_KEY, 'test-secret');
    assert.ok(!calls[1].args.includes('test-secret'));
    assert.equal((await post('stop')).status, 200);
    assert.equal((await status()).serverRunning, false);
    assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null));
  } finally { await setup.close(); await rm(root, { recursive: true, force: true }); }
});
