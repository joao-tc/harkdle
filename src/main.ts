import './style.css';
import { getAccessToken, grantedScopes, handleCallback, isLoggedIn, isLoopbackHost, SCOPES, startLogin, type AuthDeps } from './auth';
import { runBatch, type Clock, type RunResult } from './flows';
import { describeItems, fetchAllItems, parsePlaylistId, type ItemInfo } from './playlistCheck';
import { CLIP_LENGTHS, FLOWS, makeRunPlan, seededRng, type TrialTrack } from './runPlan';
import { createSdkPlayer, type SdkPlayer } from './sdkPlayer';
import { evaluateCell } from './stats';
import { pickTrialSet } from './trialSet';

const SEED = 20260101;
const RUNS_PER_CELL = 20;

// Clock and RNG are constructed here and injected everywhere else.
const clock: Clock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

const auth: AuthDeps = {
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '',
  redirectUri: 'http://127.0.0.1:5173/callback',
  fetchFn: (url, init) => fetch(url, init),
  now: () => Date.now(),
  store: sessionStorage,
};
const token = () => getAccessToken(auth);

// Tab visibility: remember when the tab was last hidden, in performance.now() time.
let lastHiddenAt = -Infinity;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) lastHiddenAt = clock.now();
});
const wasHiddenSince = (since: number) => document.hidden || lastHiddenAt >= since;

const app = document.getElementById('app')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

const banner = el('div', { className: 'banner' });
const status = el('pre', { className: 'log' });
const log = (m: string) => {
  status.textContent += `${new Date().toLocaleTimeString()}  ${m}\n`;
  status.scrollTop = status.scrollHeight;
};
const loginBtn = el('button', { textContent: '1. Log in with Spotify' });
const startBtn = el('button', { textContent: '2. Start player', disabled: true });
const whoamiBtn = el('button', { textContent: 'Who am I?', disabled: true });
const playlistInput = el('input', { placeholder: 'playlist ID, URI or URL', size: 28 });
const checkBtn = el('button', { textContent: '3. Check playlist', disabled: true });
const runBtn = el('button', { textContent: '4. Run measurement (180 runs)', disabled: true });
const stopBtn = el('button', { textContent: 'Stop', disabled: true });
const downloadBtn = el('button', { textContent: 'Download JSON', disabled: true });
const report = el('pre', { className: 'report' });
const progress = el('div', { className: 'progress' });
const results = el('div', { className: 'results' });

app.append(
  el('h1', {}, 'Playback latency spike'),
  banner,
  el('div', { className: 'row' }, loginBtn, startBtn, whoamiBtn),
  el('div', { className: 'row' }, playlistInput, checkBtn),
  report,
  el('div', { className: 'row' }, runBtn, stopBtn, downloadBtn),
  progress,
  results,
  status,
);

let player: SdkPlayer | null = null;
let trialTracks: TrialTrack[] = [];
let runs: RunResult[] = [];
let lastError: string | null = null;
let stop = false;

function showBanner(msg: string) {
  banner.textContent = msg;
  banner.hidden = false;
}
banner.hidden = true;

if (!isLoopbackHost(location.hostname)) {
  showBanner(`Open this page at http://127.0.0.1:5173, not ${location.hostname}. The PKCE verifier lives in a different origin otherwise.`);
}
if (!auth.clientId) showBanner('VITE_SPOTIFY_CLIENT_ID is empty. Copy .env.example to .env and set it.');

loginBtn.onclick = () => void startLogin(auth);

function enableAfterLogin() {
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logged in';
  startBtn.disabled = false;
  whoamiBtn.disabled = false;
  checkBtn.disabled = false;
}

whoamiBtn.onclick = async () => {
  try {
    const res = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${await token()}` } });
    const j = await res.json();
    log(`GET /me → ${res.status}  product=${j.product ?? '(missing: no user-read-private)'}  country=${j.country ?? '-'}  id=${j.id ?? '-'}`);
    const granted = grantedScopes(auth);
    const missing = granted === undefined ? null : SCOPES.split(' ').filter((s) => !granted.split(' ').includes(s));
    log(granted === undefined ? 'Granted scopes: unknown (token predates this check; log out and in again)' : `Granted scopes: ${granted}${missing?.length ? `\nMISSING: ${missing.join(' ')}` : '  (all required present)'}`);
  } catch (e) {
    log(`GET /me failed: ${e instanceof Error ? e.message : e}`);
  }
};

startBtn.onclick = async () => {
  startBtn.disabled = true;
  try {
    player = createSdkPlayer(token);
    player.onError((m) => {
      lastError = m;
      log(`SDK error: ${m}`);
    });
    log('Connecting player… (any playback on another device will be transferred to this tab)');
    const deviceId = await player.connect();
    log(`Player ready. Device ID: ${deviceId}`);
    updateRunButton();
  } catch (e) {
    player = null;
    showBanner(`Player failed: ${e instanceof Error ? e.message : e}`);
    log(`Player failed: ${e instanceof Error ? e.message : e}`);
  }
};

function pad(s: string, n: number) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

checkBtn.onclick = async () => {
  const id = parsePlaylistId(playlistInput.value);
  if (!id) return;
  report.textContent = 'Fetching…';
  try {
    const raw = await fetchAllItems(id, token, (u, i) => fetch(u, i));
    const { items, report: rep } = describeItems(raw);
    const lines = [
      `GET /playlists/${id}/items?market=from_token → ${rep.total} items`,
      '',
      'field presence (items having it):',
      ...Object.entries(rep.present).map(([k, v]) => `  ${pad(k, 14)} ${v}/${rep.total}`),
      '',
      rep.missing.length ? `MISSING core fields: ${rep.missing.join(', ')}` : 'No core field is entirely missing.',
      '',
      `types: ${JSON.stringify(countBy(items, (i) => i.type ?? 'unknown'))}`,
      `not playable (is_playable=false): ${items.filter((i) => i.isPlayable === false).length}`,
      `relinked (linked_from): ${items.filter((i) => i.hasLinkedFrom).length}`,
      `local files: ${items.filter((i) => i.isLocal).length}`,
      '',
      'per item: type | playable | linked | local | isrc | duration | name',
      ...items.map((i) => `${pad(i.type ?? '?', 8)} ${pad(String(i.isPlayable), 6)} ${i.hasLinkedFrom ? 'L' : '-'} ${i.isLocal ? 'F' : '-'} ${pad(i.isrc ?? '-', 13)} ${pad(String(i.durationMs ?? '-'), 8)} ${i.name ?? ''}`),
    ];
    report.textContent = lines.join('\n');
    selectTrials(items);
  } catch (e) {
    report.textContent = `Check failed: ${e instanceof Error ? e.message : e}\n(For a playlist you follow but don't own, a 403/empty result here is the expected Dev Mode behaviour.)`;
  }
};

function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return out;
}

function selectTrials(items: ItemInfo[]) {
  const set = pickTrialSet(items, seededRng(SEED));
  trialTracks = set.tracks;
  log(`Trial set: ${set.tracks.length} tracks${set.shortfall ? ` (short by ${set.shortfall})` : ''}`);
  updateRunButton();
}

function updateRunButton() {
  runBtn.disabled = !(player && trialTracks.length > 0);
}

runBtn.onclick = async () => {
  if (!player) return;
  runs = [];
  stop = false;
  runBtn.disabled = true;
  stopBtn.disabled = false;
  downloadBtn.disabled = true;
  const plan = makeRunPlan(trialTracks.length, FLOWS, CLIP_LENGTHS, RUNS_PER_CELL, seededRng(SEED + 1));
  log(`Running ${plan.length} runs. Keep this tab focused.`);
  const p = player;
  const live: RunResult[] = [];
  runs = await runBatch(
    plan,
    trialTracks,
    {
      player: p,
      clock,
      wasHiddenSince,
      recover: async () => {
        log('Player device lost (404). Reconnecting…');
        log(`Reconnected. Device ID: ${await p.reconnect()}`);
      },
      takeError: () => {
        const e = lastError;
        lastError = null;
        return e;
      },
    },
    (r, done, total) => {
      progress.textContent = `${done}/${total}  last: ${r.flow} ${r.clipLengthMs}ms ${r.failed ? `FAILED (${r.reason})` : `${r.resumeToFirstPositionMs?.toFixed(0)}ms`}`;
      live.push(r);
      renderResults(live);
    },
    () => stop,
  );
  renderResults(runs);
  await p.pause().catch(() => undefined);
  stopBtn.disabled = true;
  runBtn.disabled = false;
  downloadBtn.disabled = runs.length === 0;
  if (!stop && runs.length < plan.length) log(`ABORTED after ${runs.length}/${plan.length} runs: too many failures in a row, or the device could not be recovered.`);
  const count = (f: (r: RunResult) => boolean) => runs.filter(f).length;
  log(
    `Web API fallbacks (SDK call not confirmed within 1.5s): prime pause ${count((r) => r.primePauseVia === 'webApi')}, ` +
      `clip-end pause ${count((r) => r.endPauseVia === 'webApi')}, seek ${count((r) => r.seekVia === 'webApi')}.`,
  );
  log(`Done: ${runs.length} runs, ${runs.filter((r) => r.failed).length} failed, ${runs.filter((r) => r.hiddenDuringRun).length} overlapped a hidden tab.`);
};

stopBtn.onclick = () => {
  stop = true;
};

function fmt(n: number | undefined) {
  return n === undefined ? '–' : n.toFixed(0);
}

function renderResults(all: RunResult[]) {
  const table = el('table');
  const head = el('tr');
  for (const h of ['flow', 'clip', 'runs', 'fail', 'hidden', 'latency med', 'IQR', 'min', 'max', 'overshoot med', 'max', 'A5']) head.append(el('th', {}, h));
  table.append(head);
  for (const flow of FLOWS) {
    for (const clip of CLIP_LENGTHS) {
      const cell = all.filter((r) => r.flow === flow && r.clipLengthMs === clip);
      if (cell.length === 0) continue;
      const ev = evaluateCell(cell);
      const tr = el('tr', { className: ev.pass ? 'pass' : 'fail' });
      for (const v of [flow, `${clip}ms`, String(ev.runs), String(ev.failures), String(cell.filter((r) => r.hiddenDuringRun).length), fmt(ev.latency?.median), fmt(ev.latency?.iqr), fmt(ev.latency?.min), fmt(ev.latency?.max), fmt(ev.overshoot?.median), fmt(ev.overshoot?.max), ev.pass ? 'PASS' : 'FAIL']) {
        tr.append(el('td', {}, v));
      }
      table.append(tr);
    }
  }
  results.replaceChildren(table);
}

downloadBtn.onclick = () => {
  const blob = new Blob([JSON.stringify({ seed: SEED, trialTracks, runs, userAgent: navigator.userAgent }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `playback-spike-${new Date().toISOString().replace(/[:.]/g, '-')}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
};

// Page load: finish login if we came back from Spotify, otherwise resume a session.
void (async () => {
  try {
    if (await handleCallback(auth, location.search)) log('Login complete.');
  } catch (e) {
    showBanner(`Login failed: ${e instanceof Error ? e.message : e}`);
  }
  if (isLoggedIn(auth)) enableAfterLogin();
})();
