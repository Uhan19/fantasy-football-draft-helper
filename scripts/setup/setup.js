const $ = id => document.getElementById(id);
let data, working = false, initialized = false, refreshing = false;
function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').hidden = !text; $('feedback').className = error ? 'error' : ''; }
function render() {
  const s = data.settings;
  if (!initialized) {
    for (const field of ['leagueId', 'season', 'teamId', 'tunnelId']) $(field).value = s[field];
    initialized = true;
  }
  $('server-status').textContent = data.serverRunning ? 'Running' : 'Not started';
  $('espn-status').textContent = data.espnConnected ? 'Connected' : data.serverRunning ? 'Check draft settings' : 'Waiting for War Room';
  $('assistant-status').textContent = data.lastToolCallAt ? 'Tool request received' : data.tunnelRunning ? 'Waiting for a request' : 'Optional';
  $('server-dot').className = 'dot' + (data.serverRunning ? ' good' : '');
  $('espn-dot').className = 'dot' + (data.espnConnected ? ' good' : data.serverRunning ? ' wait' : '');
  $('assistant-dot').className = 'dot' + (data.lastToolCallAt ? ' good' : data.tunnelRunning ? ' wait' : '');
  $('install-description').textContent = data.dependenciesReady ? 'The required files are already installed on this Mac.' : 'A one-time download prepares War Room on this Mac. This may take a few minutes.';
  $('install').textContent = data.dependenciesReady ? 'Required files installed' : 'Install required files';
  $('cookies-saved').textContent = s.cookiesSaved ? 'Both ESPN cookies are saved. Leave the fields blank to keep them.' : 'No complete ESPN sign-in is saved yet.';
  $('runtime-saved').textContent = s.runtimeKeySaved ? 'Your runtime API key is saved. No need to paste it again.' : 'No runtime API key is saved yet.';
  $('external-server').hidden = !data.serverRunning || data.serverOwned;
  $('ready-description').textContent = data.leagueName ? `${data.leagueName} is loaded. Open the dashboard to see the board and your roster.` : 'Start War Room, then open your dashboard. Keep the launcher’s Terminal window open during the draft.';
  $('dashboard').href = data.dashboardUrl;
  $('dashboard').className = 'button secondary' + (data.serverRunning ? '' : ' disabled');
  $('dashboard').setAttribute('aria-disabled', String(!data.serverRunning));
  $('tunnel-help').textContent = !data.tunnelInstalled ? 'The optional OpenAI tunnel client is not installed. See Connect your assistant above; you can use the dashboard now.' : data.tunnelRunning ? 'A running tunnel is only one step. Ask your connected assistant to read the draft; then check for a tool request above.' : 'Loads your saved credentials automatically. Keep this launcher open while connected.';
  const blocked = working || data.busy;
  document.querySelectorAll('button').forEach(button => { button.disabled = blocked; });
  $('install').disabled ||= data.dependenciesReady;
  $('save').disabled ||= data.serverRunning && !data.serverOwned;
  $('start').disabled ||= !data.dependenciesReady || data.serverRunning;
  $('tunnel').disabled ||= data.tunnelRunning || !data.tunnelInstalled || !data.leagueInitialized || !s.runtimeKeySaved || !s.tunnelId;
  $('stop').disabled ||= !data.serverOwned && !data.tunnelRunning;
  if (data.message && !working) feedback(data.message, data.messageError);
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!response.ok) throw new Error('Setup is unavailable. Reopen Start War Room.command.');
    data = await response.json(); render();
  } catch { feedback('Setup is offline. Reopen Start War Room.command to reconnect.', true); }
  finally { refreshing = false; }
}
async function action(action, settings) {
  if (working || !data) return;
  working = true; render();
  feedback(action === 'install' ? 'Installing required files. This may take a few minutes…' : 'Working…');
  try {
    const response = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-War-Room-Setup': data.token }, body: JSON.stringify({ action, settings }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (action === 'save') {
      for (const field of ['espnS2', 'swid', 'runtimeKey']) $(field).value = '';
      $('clearEspn').checked = false;
      $('draftUrl').value = '';
      initialized = false;
    }
    feedback(result.message);
  } catch (error) { feedback(error.message || 'That step did not finish. Please try again.', true); }
  finally { working = false; await refresh(); }
}
for (const name of ['install', 'start', 'tunnel', 'stop']) $(name).addEventListener('click', () => action(name));
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  const settings = Object.fromEntries(new FormData(event.currentTarget));
  settings.clearEspn = $('clearEspn').checked;
  void action('save', settings);
});
void refresh(); setInterval(() => { void refresh(); }, 3000);
