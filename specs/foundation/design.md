# Foundation — design

**Spec:** [specs/foundation/spec.md](spec.md)

## Approach

A single Vite + React + TypeScript app with four source layers, `game` ← `spotify` ← `store` ← `ui`, whose arrows Biome enforces. Biome's `noRestrictedImports` and `noRestrictedGlobals` cover imports and globals per folder. One GritQL plugin bans `Math.random()`, `Date.now()`, `new Date()` and `performance.now()` in `src/game/`. A Vitest test copies the Biome config into a temp dir, writes a violating file per rule, and asserts that each rule fires. Auth is the spike's PKCE flow rewritten as a dependency-injected factory. The account check is a pure function over an injected `fetch`. A vanilla Zustand store runs both and exposes one `screen` value. Two thin React screens render the setup states. A deliberately small signed-in shell proves the round trip until item 2 replaces it.

Biome's behaviour was probed on 2.6.3 before writing this (scratch project, not in the repo). Confirmed: `**/ui/**` matches both `../ui/b` and `@/ui/b`; it also flags `import type`, and the rule has no type-only exemption; the global deny list works; and a Grit plugin listed under an `overrides` entry runs only for that entry's `includes` (a `Date.now()` in `src/spotify/` was not flagged, the same call in `src/game/` was).

## Layer placement

| New piece | Layer | Depends on | Logic/Visual | Keeps invariants? |
| --------- | ----- | ---------- | ------------ | ----------------- |
| `createAuth` (PKCE, tokens, refresh) | `src/spotify/` | nothing | logic | clock, RNG, `fetch`, storage and navigation injected ✅; stored shape versioned ✅ (4) |
| `checkAccount` (`/me` → result) | `src/spotify/` | `Auth.getAccessToken` type | logic | pure over injected `fetch` ✅ |
| `createSessionStore` | `src/store/` | auth + account types | logic | no React ✅; deps injected ✅ |
| `LoginScreen`, `SetupErrorScreen` | `src/ui/` | store types, primitives | visual | rules stay in the store ✅ (3) |
| shadcn primitives (button, card, alert) | `src/ui/primitives/` | Tailwind | visual | generated, not linted |
| `App`, `main`, `SignedInShell` | `src/` / `src/ui/` | store, screens | integration | composition root: the only place real `fetch`, `Date.now`, `localStorage` and `window` are passed in |
| Biome config, Grit rule, fixture test | repo root, `tools/` | Biome installed | tooling | n/a |

Layer graph (an arrow means "may import"): `ui → store → spotify → game`, plus `ui → game` for types. `game` imports nothing from the other layers or from React. `ui` reaches Spotify only through the store.

## Reuse

| Existing | Where | How used |
| -------- | ----- | -------- |
| PKCE flow, scopes, refresh window, `challengeFor`, RFC 7636 test vector | `spike/playback-latency:src/auth.ts`, `auth.test.ts` | Ported by hand into `createAuth`. Scopes and the vector test are kept as they are. |
| `isLoopbackHost` | same | Moved into the store's environment check. |
| Vite server config (`127.0.0.1:5173`, `strictPort`) | `spike/playback-latency:vite.config.ts` | Copied. |
| `tsconfig.json` strictness (`noUncheckedIndexedAccess`) | same | Kept; JSX and path alias added. The `spotify-web-playback-sdk` entry in `types` is dropped (item 3 owns it). |
| Spike docs | `spike/playback-latency:docs/**`, `.env.example` | Brought over with `git checkout spike/playback-latency -- docs .env.example`. |

Nothing else from the spike is reused: its measurement code is throwaway.

## Types

All signatures below are the contract between the parallel tasks. Subagents code against exactly these.

### `src/spotify/auth.ts`

**Layer:** spotify · **Responsibility:** PKCE login, token storage, silent refresh.

```ts
export const SCOPES: readonly string[]; // exactly the 7 in ADR-0001
export const REFRESH_WINDOW_MS = 60_000;

export interface Tokens { accessToken: string; refreshToken: string; expiresAt: number; scope?: string }

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FetchResponse { ok: boolean; status: number; json(): Promise<unknown> }
export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

export interface AuthDeps {
  clientId: string;
  redirectUri: string;
  fetchFn: FetchFn;
  now: () => number;                      // epoch ms
  randomBytes: (n: number) => Uint8Array; // PKCE verifier source
  store: KeyValueStore;
  navigate: (url: string) => void;        // full-page redirect to Spotify
  replaceUrl: (path: string) => void;     // history.replaceState, to clean ?code=
}

export type AuthErrorKind = 'not-logged-in' | 'missing-verifier' | 'token-endpoint' | 'refresh-failed';
export class AuthError extends Error { readonly kind: AuthErrorKind }

export interface Auth {
  startLogin(): Promise<void>;                    // stores verifier, calls deps.navigate
  handleCallback(search: string): Promise<boolean>; // true if ?code= was exchanged; cleans the URL
  getAccessToken(): Promise<string>;              // refreshes inside REFRESH_WINDOW_MS; throws AuthError
  isLoggedIn(): boolean;
  logout(): void;                                 // clears tokens and verifier
}

export function createAuth(deps: AuthDeps): Auth;
export function challengeFor(verifier: string): Promise<string>;
export function needsRefresh(t: Tokens, now: number): boolean;
export function redirectUriFor(
  loc: { origin: string }, baseUrl: string, dev: boolean,
): string; // dev → `${origin}/callback`; prod → `${origin}${baseUrl}`
```

Storage keys: `harkdle.auth` and `harkdle.pkce`. Both hold JSON `{ v: 1, ... }`; the tokens object is `{ v: 1, accessToken, refreshToken, expiresAt, scope? }`. `load` returns `null` (logged out) when the key is absent, not valid JSON, `v !== 1`, or the shape is wrong. A refresh response without `refresh_token` keeps the old one. A refresh failure clears nothing but throws `AuthError('refresh-failed')`.

### `src/spotify/account.ts`

**Layer:** spotify · **Responsibility:** turn `GET /me` into a typed result (R1).

```ts
export interface AccountUser { id: string; displayName: string; product: string; country?: string }

export type AccountFailure = 'not-premium' | 'not-allowlisted' | 'session-expired' | 'unexpected';
export type AccountResult =
  | { ok: true; user: AccountUser }
  | { ok: false; error: AccountFailure; detail?: string };

export function checkAccount(deps: {
  getAccessToken: () => Promise<string>;
  fetchFn: FetchFn;
}): Promise<AccountResult>;
```

| `GET https://api.spotify.com/v1/me` outcome | Result |
| --- | --- |
| 200, `product === 'premium'` | `ok`, `displayName` = `display_name ?? id` |
| 200, `product` is any other string | `not-premium` |
| 200, `product` absent (scope missing) | `unexpected`, `detail: 'product missing'` |
| 401, or `getAccessToken` throws (any error) | `session-expired` |
| 403 | `not-allowlisted` |
| other status, a thrown `fetch`, or an unparseable body | `unexpected`, `detail` set |

### `src/store/session.ts`

**Layer:** store · **Responsibility:** the current screen, and the transitions between setup states.

```ts
import type { Auth } from '@/spotify/auth';
import type { AccountResult, AccountUser } from '@/spotify/account';

export type SetupErrorKind =
  | 'not-premium' | 'not-allowlisted' | 'session-expired' | 'unexpected'
  | 'wrong-origin' | 'missing-config'
  | 'sdk-account' | 'sdk-init';   // the last two are produced by item 3

export type Screen =
  | { name: 'booting' }
  | { name: 'login' }
  | { name: 'checking' }
  | { name: 'setup-error'; error: SetupErrorKind; detail?: string }
  | { name: 'signed-in'; user: AccountUser };

export interface SessionDeps {
  auth: Auth;
  checkAccount: () => Promise<AccountResult>;
  env: { clientId: string | undefined; dev: boolean; hostname: string };
  search: string; // location.search at load
}

export interface SessionState {
  screen: Screen;
  boot(): Promise<void>;   // config guard → callback exchange → logged-in? → check
  login(): Promise<void>;  // auth.startLogin; failure → setup-error unexpected
  retry(): Promise<void>;  // session-expired → logout; otherwise re-run the check (or boot)
  logout(): void;          // auth.logout → login
}

export function createSessionStore(deps: SessionDeps): StoreApi<SessionState>; // zustand/vanilla
```

`boot` order: (1) `clientId` empty → `missing-config`; (2) `dev && hostname !== '127.0.0.1'` → `wrong-origin`; (3) `handleCallback(search)`, and a throw → `unexpected`; (4) not logged in → `login`; (5) `checking` → `checkAccount` → `signed-in` or `setup-error`. Re-entry is guarded: while `screen.name` is `booting` or `checking`, `boot`/`retry` are no-ops (epic edge case: no double actions).

### `src/ui/LoginScreen.tsx`, `src/ui/SetupErrorScreen.tsx`

**Layer:** ui · **Responsibility:** render a screen from props. No imports from `spotify/`.

```ts
export function LoginScreen(props: { onLogin: () => void }): JSX.Element;

export function SetupErrorScreen(props: {
  error: SetupErrorKind;      // type imported from '@/store/session'
  detail?: string;
  onRetry: () => void;
  onLogout: () => void;
  devUrl?: string;            // shown for wrong-origin: the 127.0.0.1 URL to open instead
}): JSX.Element;
```

Copy per kind (one message, one fix, as the epic requires): `not-premium` (needs full Premium, not Lite/Mini), `not-allowlisted` (ask the owner to add the Spotify email), `wrong-origin` (open `devUrl`), `missing-config` (set `VITE_SPOTIFY_CLIENT_ID` in `.env`), `session-expired` (log in again), `unexpected` (retry, shows `detail`), `sdk-account` / `sdk-init` (Premium or browser support problem; retry). Retry is hidden for `wrong-origin` and `missing-config` (they need a code or URL change).

### Composition root — `src/main.tsx`, `src/App.tsx`, `src/ui/SignedInShell.tsx`

`main.tsx` builds the real `AuthDeps` (`fetch`, `Date.now`, `crypto.getRandomValues`, `localStorage`, `location.assign`, `history.replaceState`), creates the store with `env = { clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID, dev: import.meta.env.DEV, hostname: location.hostname }`, calls `boot()`, and renders `<App store={store} />`. `App` selects the screen with `useStore(store, s => s.screen)` and renders the matching component. This is the only place ambient browser APIs are touched.

## Data model

Persisted: `harkdle.auth` and `harkdle.pkce` in `localStorage` (shapes above, `v: 1`). Everything else is in memory. No settings are persisted here (item 6).

## Time & randomness

`now` and `randomBytes` are injected into `createAuth`. Tests use a fixed clock and a fixed byte array. `src/game/` is empty, but the ambient-API ban is already live for when it is not.

## Error handling

| Failure | Behavior | Surfaced as |
| ------- | -------- | ----------- |
| Token endpoint non-2xx during code exchange | `AuthError('token-endpoint')`, verifier kept | `setup-error: unexpected` |
| Callback arrives without a stored verifier | `AuthError('missing-verifier')` | `setup-error: unexpected` with the "different origin" hint in `detail` |
| Refresh fails | `AuthError('refresh-failed')` | `setup-error: session-expired` |
| Corrupt or unknown-version storage | Treated as logged out | `login` |
| `/me` outcomes | Table above | per table |
| Double click on Retry / Login | Guarded in the store | no second request |

## Biome enforcement (the invariants)

`biome.json` (T5) sets `linter.rules.recommended` and the formatter, ignores `dist/` and `src/ui/primitives/`, and carries one `overrides` entry per layer:

| Path | Denied imports | Denied globals | Plugin |
| ---- | -------------- | -------------- | ------ |
| `src/game/**` | `react`, `react-dom`, `zustand`, `**/ui/**`, `**/store/**`, `**/spotify/**` | `window`, `document`, `fetch`, `localStorage`, `sessionStorage`, `navigator`, `location` | `rules/no-ambient.grit` (all four calls) |
| `src/spotify/**` | `react`, `react-dom`, `zustand`, `**/ui/**`, `**/store/**` | none | none |
| `src/store/**` | `react`, `react-dom`, `**/ui/**` | none | none |
| `src/ui/**` | `**/spotify/**` | none | none |
| everywhere except `src/spotify/playback/sdk/**` | none | `Spotify` | none |

`no-ambient.grit` is listed under the `src/game/**` override only (`plugins` inside `overrides`), so it does not fire in `src/main.tsx` or `src/spotify/**`, which legitimately call `Date.now` and so on.

Because the import rule also flags `import type`, `ui` cannot import `AccountUser` from `@/spotify/account`. `src/store/session.ts` re-exports it (`export type { AccountUser } from '@/spotify/account'`) and `ui` imports it from the store. The layer boundary stays strict.

## Decisions

| #   | Decision | Alternatives | Why | ADR? |
| --- | -------- | ------------ | --- | ---- |
| D1  | Accept ADR-0001 as written minus TanStack Router | Keep the router; supersede with a new ADR | Epic A1. The ADR is still `Proposed`, so editing it keeps one source of truth. | ADR-0001 (existing) |
| D2  | Four-layer graph enforced by Biome path overrides, plus a fixture test | Review discipline only; `eslint-plugin-boundaries`; `dependency-cruiser` | Epic A23 and A25 already pick Biome and "enforced by Biome import restrictions and tests". No new tool. | no (spec) |
| D3  | Vanilla Zustand store with injected deps, bound to React in `ui` via `useStore` | Store creates its own deps; React context + `useReducer` | Epic A1. The store has to run outside components (SDK events in item 3) and be testable without a DOM. | no |
| D4  | `Screen` is a discriminated union owned by the store | A router; booleans per screen | Epic A1 (no router). The union makes illegal combinations unrepresentable. | no |
| D5  | TanStack Query deferred to item 2 | Install now | Nothing in this item fetches data worth caching: the `/me` result is one value held in the store. | no |
| D6  | shadcn primitives in `src/ui/primitives/` | Default `src/components/ui` | One UI layer path for the Biome rules. | no |
| D7  | Stored auth is `{ v: 1, … }` and an unknown shape means logged out | Unversioned; migrate | Invariant 4. There is no older shape to migrate. | no |

## Requirement coverage

| Requirement | Served by |
| ----------- | --------- |
| F-1 | T1 |
| F-2 | T2 |
| F-3 | T3, T4 (primitives build), T11 (full build) |
| F-4 | T5 (config, rule, fixture test); F12 note for invariant 4 → T6 tests |
| F-5 | T12 |
| F-6 | T6 (`startLogin`, `handleCallback`), T8 (`login`), T9 (button), T11 (wiring) |
| F-7 | T6 (`getAccessToken`), T7 (`session-expired` mapping), T8 (`retry`) |
| F-8 | T6 (`load`), T8 (`boot` → `login`) |
| F-9 | T7 (table), T8 (mapping to screens), T10 (copy) |
| F-10 | T8 (`boot` guards), T10 (copy + `devUrl`) |
| F-11 | T9, T10 |

## Integration points (shared touchpoints)

Serialized in the task plan, one writer per wave:

- `package.json` / `package-lock.json`: T3 installs everything except shadcn's dependencies (T4).
- `src/index.css`, `components.json`: T4.
- `biome.json`: T5 only. T3 adds the `lint` script but not the file.
- `src/main.tsx`, `src/App.tsx`: written minimally by T3 so the build passes, then replaced by T11.
- `.claude/skills/feature-dev/SKILL.md` and `.claude/skills/README.md`: T12 only.
