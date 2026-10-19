export const SCOPES = [
  'streaming',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

export const REFRESH_WINDOW_MS = 60_000;
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export interface AuthDeps {
  clientId: string;
  redirectUri: string;
  fetchFn: FetchFn;
  now: () => number;
  store: KeyValueStore;
}

const TOKENS_KEY = 'spike.tokens';
const VERIFIER_KEY = 'spike.verifier';

export function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1';
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateVerifier(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return base64Url(random(64));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function startLogin(deps: Pick<AuthDeps, 'clientId' | 'redirectUri' | 'store'>): Promise<void> {
  const verifier = generateVerifier();
  deps.store.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: deps.clientId,
    response_type: 'code',
    redirect_uri: deps.redirectUri,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

let memory: Tokens | null = null;

function save(deps: AuthDeps, t: Tokens): void {
  memory = t;
  deps.store.setItem(TOKENS_KEY, JSON.stringify(t));
}

function load(deps: AuthDeps): Tokens | null {
  if (memory) return memory;
  const raw = deps.store.getItem(TOKENS_KEY);
  if (!raw) return null;
  memory = JSON.parse(raw) as Tokens;
  return memory;
}

async function tokenRequest(deps: AuthDeps, body: Record<string, string>): Promise<Tokens> {
  const res = await deps.fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: deps.clientId, ...body }).toString(),
  });
  if (!res.ok) throw new Error(`token endpoint → ${res.status}`);
  const j = await res.json();
  return {
    accessToken: j.access_token,
    // a refresh response may omit refresh_token; keep the old one then
    refreshToken: j.refresh_token ?? body.refresh_token ?? '',
    expiresAt: deps.now() + j.expires_in * 1000,
  };
}

/** Call on page load. Returns true when the URL carried an auth code that was exchanged. */
export async function handleCallback(deps: AuthDeps, search: string): Promise<boolean> {
  const code = new URLSearchParams(search).get('code');
  if (!code) return false;
  const verifier = deps.store.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('missing PKCE verifier (opened on a different origin than the one that started login?)');
  const t = await tokenRequest(deps, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: deps.redirectUri,
    code_verifier: verifier,
  });
  save(deps, t);
  deps.store.removeItem(VERIFIER_KEY);
  window.history.replaceState({}, '', '/');
  return true;
}

export function needsRefresh(t: Tokens, now: number): boolean {
  return t.expiresAt - now < REFRESH_WINDOW_MS;
}

export async function getAccessToken(deps: AuthDeps): Promise<string> {
  const t = load(deps);
  if (!t) throw new Error('not logged in');
  if (!needsRefresh(t, deps.now())) return t.accessToken;
  const fresh = await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: t.refreshToken });
  save(deps, fresh);
  return fresh.accessToken;
}

export function isLoggedIn(deps: AuthDeps): boolean {
  return load(deps) !== null;
}

/** test helper */
export function _resetMemory(): void {
  memory = null;
}
