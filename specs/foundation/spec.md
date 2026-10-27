# Foundation (roadmap item 0) — spec

**Size:** Large
**Sub-phase:** single (the only rule worth testing is the account check; the two screens are thin)
**Status:** Draft (ledger closed; plan awaiting approval)
**Parent:** [specs/app-v1/spec.md](../app-v1/spec.md), item 0
**Branch:** `feat/0/foundation` (from `main`)

## Problem

Nothing buildable exists yet. `main` holds only docs, and the playback spike lives on `spike/playback-latency` as throwaway code. Every later roadmap item needs the same things in place first: an accepted stack decision, gates that run, invariants that fail the build when broken, and a login that works. This item lays them down, with just enough real code (PKCE login, the account check and its two screens) to prove the toolchain end to end.

## Ambiguity ledger

Most of the answers come from the epic ledger (A1–A28). Rows below are the ones this item adds or narrows.

| ID  | Question | Status | Answer |
| --- | -------- | ------ | ------ |
| F1  | What comes over from the spike branch? | Resolved | Docs only: the findings, the raw run data, ADR-0001 and `.env.example`. The spike's code stays on its branch; items 2 and 3 port what they need with `git show spike/playback-latency:<path>`. Auth is rewritten, not copied (F4). |
| F2  | Is ADR-0001 edited or superseded? | Resolved | Edited in place: it is still `Proposed`, so the router row goes and the status becomes `Accepted` (epic A1). The user confirms at the plan gate. |
| F3  | Which libraries are installed now? | Resolved | React, Vite, Tailwind, shadcn, Zustand, Biome and Vitest. **TanStack Query is deferred to item 2**, its first real use (playlist fetching). Installing it now would add a dependency and a provider that nothing calls. *Deviates from the epic's item-0 line; the user can reverse it at the plan gate.* |
| F4 | How does the spike's auth change in the port? | Resolved | Same PKCE flow and scopes (ADR-0001). It becomes a factory with injected `fetch`, clock, storage and navigation (no module-level token cache, no direct `window` use). It gets a `logout`. Stored state is versioned (invariant 4). Storage keys use the `harkdle.` prefix. |
| F5 | Which redirect URI is used? | Resolved | Dev: `http://127.0.0.1:5173/callback`. Production: `location.origin + import.meta.env.BASE_URL` (the Pages root). Item 4 registers the second one with Spotify and sets `base`. |
| F6 | What does `/me` tell us? | Resolved | `product === 'premium'` is the pass condition; any other value is "not Premium". HTTP 403 is "not allowlisted" (expected for Dev Mode). 401 is an expired session, so log in again. Anything else is a retryable failure. **How Lite/Mini and non-allowlisted accounts really report is unverified** (epic "Needs verification"). The table in the design is the working assumption; Done-when asks the owner to confirm `product` on their account. The SDK `account_error` stays the fallback signal (owned by item 3). |
| F7 | What does the user see after a successful check? | Resolved | A small signed-in shell: the display name and a Log out button. It stands in for the playlist picker and is replaced by item 2. Without it there is nothing to show that login works. |
| F8 | Which Setup errors exist? | Resolved | One screen, one union: `not-premium`, `not-allowlisted`, `wrong-origin` (dev opened on any host other than `127.0.0.1`), `missing-config` (no client ID), `session-expired`, `unexpected` (retryable), and `sdk-account` / `sdk-init`. The two SDK kinds have copy and a test, but nothing produces them until item 3. The epic lists them on this screen, so they are written once. |
| F9 | Where do tests live and which environment? | Resolved | Beside the source (`x.ts` / `x.test.ts`). Vitest runs in `node`. Screen tests opt into jsdom per file. |
| F10 | Where do shadcn components go? | Resolved | `src/ui/primitives/` (not shadcn's default `src/components/ui`), so `src/ui/` is the single UI layer and the Biome rules need one path. Biome does not lint or format the generated primitives. |
| F11 | How is invariant 5 (no SDK types outside the adapter) enforced before the SDK is installed? | Resolved | Biome denies the global `Spotify` everywhere except `src/spotify/playback/sdk/**` (the adapter folder, created by item 3). The SDK types package is installed by item 3, so there is nothing to test against yet. The rule is proven by the fixture test, which writes a file using `Spotify` outside that folder. |
| F12 | Can invariant 4 (versioned persisted state) be checked mechanically? | Resolved | Not by Biome. It is enforced by tests: the auth store test asserts the stored shape carries `v`, and that unknown or corrupt versions read as logged out. Item 6 extends the pattern to settings. The profile lists it as "test-enforced". |

**Open: 0**

Category sweep: scope ✅ (F1, F3, F7) · rules ✅ (F6, F8) · layer ✅ (design) · data ✅ (F4, F12) · time/random ✅ (auth takes clock and verifier RNG as inputs) · behavior ✅ (F5, F7) · errors ✅ (F6, F8) · contracts ✅ (design: `Auth`, `checkAccount`, `SetupError`, `SessionState`) · platform ✅ (desktop Chrome, A4) · non-functional ✅ (token refresh stays silent, spike R2) · done ✅

## Requirements

| ID  | Requirement | Priority |
| --- | ----------- | -------- |
| F-1 | ADR-0001 SHALL be `Accepted` with TanStack Router removed, and SHALL land in its own commit before any code. The findings, the run data and `.env.example` SHALL be on this branch. | P1 |
| F-2 | `game-design.md` SHALL hold the rules of epic A6–A12 and A21 (matching, suggestions, featured artist, mixed submissions, reroll stacking, short-track starts, hat trick), so the engine item codes against one written source. | P1 |
| F-3 | The repo SHALL have working `typecheck`, `lint`, `test` and `build` scripts, and all four SHALL pass on a clean checkout. | P1 |
| F-4 | The invariants (1–3 and 5) SHALL fail `npm run lint` when broken, and a test SHALL prove each rule fires on a violating fixture. Invariant 4 SHALL be covered by the auth tests (F12). | P1 |
| F-5 | The feature-dev Project profile (stack, layout, gates, invariants) SHALL be filled in the same commit that makes the last gate real. | P1 |
| F-6 | WHEN the player presses "Log in with Spotify" THEN the app SHALL run Authorization Code + PKCE with exactly the ADR-0001 scopes, and on return SHALL exchange the code and clean the URL. | P1 |
| F-7 | WHEN the access token is within 60 s of expiry THEN the next `getAccessToken` SHALL refresh it without user action. A failed refresh SHALL send the player to `session-expired`. | P1 |
| F-8 | WHEN stored auth state is missing, corrupt, or carries an unknown version THEN the app SHALL treat the player as logged out. | P1 |
| F-9 | WHEN the account check runs THEN the result SHALL map exactly as in the design table (R1): non-Premium → `not-premium`, 403 → `not-allowlisted`, success → signed-in shell. | P1 |
| F-10 | WHEN the app is opened in dev on a host other than `127.0.0.1`, or without a client ID, THEN the player SHALL see `wrong-origin` / `missing-config` instead of a login that cannot work. | P1 |
| F-11 | The Login screen SHALL state what harkdle is and its requirements (Premium, allowlist, desktop Chrome). The Setup error screen SHALL give one specific message and a fix per kind, with Retry and Log out. | P1 |

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Playlist picker, cleaning, suggestions | Item 2. The signed-in shell is a stand-in only. |
| `PlaybackAdapter`, SDK script tag, `@types/spotify-web-playback-sdk` | Item 3. The SDK `account_error` / `initialization_error` are produced there. |
| Pages workflow, `base`, second redirect URI | Item 4. |
| TanStack Query | F3. Item 2. |
| Settings store | Item 6. |
| Spotify attribution on screens | Item 5 (Reveal). The Login screen carries only what the guidelines need for a login button, checked in the visual pass. |

## Done when

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` are green.
- [ ] Each invariant rule is shown to fire by the fixture test (F-4).
- [ ] In desktop Chrome at `http://127.0.0.1:5173`: Log in → Spotify consent → back on the signed-in shell with the display name; reload keeps the session; Log out returns to Login.
- [ ] The owner's `/me` `product` value is recorded in the findings (resolves the epic's "Needs verification" for the Premium case).
- [ ] `http://localhost:5173` shows `wrong-origin`, and an empty client ID shows `missing-config`.
- [ ] Not-Premium and not-allowlisted are covered by unit tests with a fake `fetch`. Reaching them with real accounts is deferred to the epic's final Done-when.
- [ ] A human has looked at both screens at desktop width (Login, Setup error).
