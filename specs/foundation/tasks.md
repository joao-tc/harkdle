# Foundation — tasks

**Spec:** [spec.md](spec.md) · **Design:** [design.md](design.md)
**Status:** Draft

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 1 | T1, T2, T3 | parallel — 3 subagents | T1 alone first: `docs(adr): accept ADR-0001` lands before any code. T2 `docs: fold …`; T3 `chore: scaffold …` |
| 2 | T4, T5, T6, T7 | parallel — 4 subagents | one per task |
| 3 | T8 | sequential — store | `feat(store): …` |
| 4 | T9, T10 | parallel — 2 subagents | one per task |
| 5 | T11 | sequential — integration + browser check | `feat: wire login flow …` |
| 6 | T12 | sequential — orchestrator | `docs: fill feature-dev profile` (same commit as the last gate becoming real) |

The commands in `Verify` lines exist only after T3 lands. `npm test -- <path>` runs one suite (`vitest run <path>`).

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | Carry spike docs over and accept ADR-0001 (one ADR + moved files) | ✅ Atomic |
| T2 | One doc section set: rules A6–A12, A21 | ✅ Atomic |
| T3 | Toolchain scaffold: Vite, React, TS, Tailwind, Vitest, scripts, deps | ⚠️ Cohesive (one toolchain, one manifest) |
| T4 | shadcn init + 3 primitives | ⚠️ Cohesive (one generator run) |
| T5 | Biome config + Grit rule + fixture test | ⚠️ Cohesive (rule, its config, its proof) |
| T6 | `createAuth` + tests | ✅ Atomic |
| T7 | `checkAccount` + tests | ✅ Atomic |
| T8 | Session store + tests | ✅ Atomic |
| T9 | Login screen + test | ✅ Atomic |
| T10 | Setup error screen + test | ✅ Atomic |
| T11 | Composition root + shell | ⚠️ Cohesive (integration by definition) |
| T12 | Profile fill (orchestrator) | ✅ Atomic |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in an earlier wave? |
| ---- | ---------- | ---- | ---------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ |
| T3 | — | 1 | ✅ |
| T4 | T3 | 2 | ✅ |
| T5 | T3 | 2 | ✅ |
| T6 | T3 | 2 | ✅ |
| T7 | T3 (and the `FetchFn` type, written in design, defined by T6; see note) | 2 | ✅ |
| T8 | T6, T7 | 3 | ✅ |
| T9 | T4, T8 | 4 | ✅ |
| T10 | T4, T8 | 4 | ✅ |
| T11 | T8, T9, T10 | 5 | ✅ |
| T12 | T5, T11 | 6 | ✅ |

Note: `FetchFn` is exported by `auth.ts` (T6) and imported by `account.ts` (T7), in the same wave. T7 therefore declares `import type { FetchFn } from './auth'` and must verify with `npm test -- src/spotify/account` only (Vitest strips types); the typecheck for the pair runs at the wave gate. This is the one declared cross-reference between wave-mates; it is a type-only contract fixed in the design.

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | docs | `docs/**`, `.env.example`, `docs/adr/0001-stack-and-playback.md` | — |
| 1 | T2 | docs | `game-design.md` | — |
| 1 | T3 | tooling | `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` (only if needed), `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `.gitignore` (only if needed) | — |
| 2 | T4 | ui | `components.json`, `src/ui/primitives/**`, `src/lib/utils.ts`, `src/index.css`, `package.json`, `package-lock.json` | — (T3 is wave 1) |
| 2 | T5 | tooling | `biome.json`, `rules/no-ambient.grit`, `tools/invariants.test.ts` | — |
| 2 | T6 | spotify | `src/spotify/auth.ts`, `src/spotify/auth.test.ts` | — |
| 2 | T7 | spotify | `src/spotify/account.ts`, `src/spotify/account.test.ts` | — |
| 3 | T8 | store | `src/store/session.ts`, `src/store/session.test.ts` | — |
| 4 | T9 | ui | `src/ui/LoginScreen.tsx`, `src/ui/LoginScreen.test.tsx` | — |
| 4 | T10 | ui | `src/ui/SetupErrorScreen.tsx`, `src/ui/SetupErrorScreen.test.tsx` | — |
| 5 | T11 | integration | `src/main.tsx`, `src/App.tsx`, `src/ui/SignedInShell.tsx` | — |
| 6 | T12 | docs | `.claude/skills/feature-dev/SKILL.md`, `.claude/skills/README.md`, `specs/foundation/*` | — |

Wave 2 shared resources: T4 and T5 each run a package binary but write to different outputs. T5's fixture test uses `os.tmpdir()` per run, so no shared directory. No wave-2 task starts a dev server. T3 must install **all** npm dependencies except shadcn's own (T4 adds those); nobody else in wave 2 touches `package.json`.

Reads that are shared (not writes): `specs/foundation/design.md` by all; `tsconfig.json` by T4–T11.

## Tasks

### T1 — Carry the spike docs over and accept ADR-0001

**Wave:** 1 · **Layer:** docs · **Requirement:** F-1 · **Depends on:** —
**Owns:** `docs/adr/0001-stack-and-playback.md`, `docs/spike-playback-latency.md`, `docs/spike-data/**`, `.env.example`
**Reads:** `spike/playback-latency` branch

**Do:** `git checkout spike/playback-latency -- docs .env.example`; in ADR-0001 delete the TanStack Router row, add that the current screen is state in the Zustand store (no URL routing, per epic A1), update the hosting row's reasoning (no hash history), set `Status: Accepted` and the date, and tick the follow-up that the profile is filled by `specs/foundation`; in the findings, repoint links to deleted files (`specs/playback-spike/spec.md`, `src/stats.ts`, `src/auth.ts`, `src/sdkPlayer.ts`, `src/flows.ts`) to `spike/playback-latency:<path>` text, not links.

**Invariants:** n/a (docs).

**Done when:**
- [ ] ADR-0001 says `Accepted`, no mention of TanStack Router except in "Alternatives considered"
- [ ] No relative link in `docs/` points at a file that does not exist on this branch
- [ ] `.env.example` present

**Verify:** `grep -rn "TanStack Router" docs/adr/0001-stack-and-playback.md` shows only the alternatives row; link check by listing each `](...)` target in `docs/` and confirming it exists.

*The orchestrator does not accept the ADR until the user confirms at the plan gate.*

### T2 — Fold the settled rules into `game-design.md`

**Wave:** 1 · **Layer:** docs · **Requirement:** F-2 · **Depends on:** —
**Owns:** `game-design.md`
**Reads:** `specs/app-v1/spec.md` rows A6–A12, A21

**Do:** add the rules to the matching sections: a correct guess is a picked suggestion compared on normalized text with version suffixes stripped, and a same-titled song by another artist counts for Title (A6); suggestions are per field, deduplicated after normalization, and reveal nothing about the other fields (A7); `artists[0]` is main and any other listed artist earns 50% of the Artist points, locks at once, costs no step and is final (A8, A10); a mixed submission locks the correct fields at the current step and then advances once (A9); rerolls stack linearly per round ×(1 − 0.1·n), floored at ×0.5 (A11); the latest start is length − 16 s − 2 s, below 10% of the length the round starts at 0:00 with reroll disabled (A12); a featured-artist lock still earns the hat trick (A21). Resolve the "featured-artist credit" open question and its tunable row to 50%. Keep the file's tone and the Tunable Parameters table in step.

**Invariants:** n/a (docs).

**Done when:**
- [ ] Every one of A6–A12 and A21 appears once, in the section where a reader of that rule would look
- [ ] "Open Questions" no longer lists the featured-artist credit
- [ ] No rule changes meaning from the epic's wording

**Verify:** read-through against the epic rows; `grep -n "50%" game-design.md` finds the featured-artist rows.

### T3 — Scaffold the toolchain

**Wave:** 1 · **Layer:** tooling · **Requirement:** F-3 · **Depends on:** —
**Owns:** `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `.gitignore` (only to add entries)
**Reads:** `spike/playback-latency:tsconfig.json`, `vite.config.ts`, `package.json`; design §Reuse

**Do:** create a Vite 8 + React 19 + TypeScript app with Tailwind 4 (`@tailwindcss/vite`), Vitest 5, Biome 2.6.3, Zustand 5, `@testing-library/react`, `jsdom`, `lucide-react` (shadcn will want it; install now so T4 only adds shadcn's own deps), with scripts `dev`, `build` (`tsc --noEmit && vite build`), `typecheck`, `lint` (`biome check .`), `test` (`vitest run`); `@/` alias → `src/` in both `tsconfig.json` and `vite.config.ts`; server `127.0.0.1:5173` strictPort as the spike; `.env.example` is T1's, so only reference `VITE_SPOTIFY_CLIENT_ID` in `vite-env.d.ts`. `index.html` has no SDK script (item 3). `main.tsx` + `App.tsx` render one heading so the build has an entry; T11 replaces both. Pin exact versions from the spike where it had one (`typescript`, `vite`, `vitest`).

**Invariants:** none yet (no layer folders exist).

**Done when:**
- [ ] `npm install` clean, `npm run typecheck`, `npm run build` pass
- [ ] `npm test` runs (no test files is acceptable at this point: pass with `--passWithNoTests` in the script only if Vitest 5 would otherwise exit 1; note it)
- [ ] `npm run dev` serves `http://127.0.0.1:5173` (checked and stopped)
- [ ] No `@tanstack/*` and no `@types/spotify-web-playback-sdk` in `package.json`

**Verify:** `npm run typecheck && npm run build`

### T4 — shadcn init and the three primitives

**Wave:** 2 · **Layer:** ui · **Requirement:** F-11 · **Depends on:** T3
**Owns:** `components.json`, `src/ui/primitives/**`, `src/lib/utils.ts`, `src/index.css`, `package.json`, `package-lock.json`
**Reads:** `tsconfig.json`, `vite.config.ts`

**Do:** run shadcn's init (CLI `shadcn@4`, Tailwind 4, `neutral` base, dark theme on `:root`) with aliases pointing `ui` at `@/ui/primitives` and `utils` at `@/lib/utils`, then add `button`, `card` and `alert`. Make the dark neutral theme the default (epic A20: dark neutral, shadcn defaults).

**Invariants:** UI layer (3): primitives import nothing from `spotify/` or `store/`.

**Done when:**
- [ ] Three primitives exist under `src/ui/primitives/`; no file outside the owned list changed
- [ ] `npm run typecheck && npm run build` pass
- [ ] The page background is dark

**Verify:** `npm run typecheck && npm run build`
*If the CLI cannot run non-interactively or needs network the sandbox lacks, report Blocked instead of hand-writing the primitives.*

### T5 — Biome config, the ambient-API rule, and the proof test

**Wave:** 2 · **Layer:** tooling · **Requirement:** F-4 · **Depends on:** T3
**Owns:** `biome.json`, `rules/no-ambient.grit`, `tools/invariants.test.ts`
**Reads:** design §Biome enforcement, `package.json`

**Do:** write `biome.json` exactly per the design table (recommended rules, formatter, ignore `dist/` and `src/ui/primitives/`, one `overrides` entry per layer, `Spotify` global denied outside `src/spotify/playback/sdk/**`, the Grit plugin under the `src/game/**` override only); write the Grit rule covering `Math.random()`, `Date.now()`, `new Date()` and `performance.now()`; write a Vitest test (node env) that copies `biome.json` and `rules/` into a fresh `os.tmpdir()` directory, writes one violating file per rule (react import in `game`; `@/ui/...` import in `game`; `window` in `game`; each of the four calls in `game`; `@/ui/...` import in `spotify` and in `store`; `@/spotify/...` import in `ui`; `Spotify` global in `src/spotify/other.ts`) plus clean files (`Date.now()` in `src/spotify/`, `Spotify` in `src/spotify/playback/sdk/x.ts`), runs the repo's `node_modules/.bin/biome lint --reporter=json` there, and asserts the exact set of flagged files and rule categories.

**Invariants:** this task *is* the invariant enforcement (1, 2, 3, 5). Do not weaken a rule to make a fixture pass.

**Done when:**
- [ ] `npm test -- tools/invariants` passes, every violating fixture flagged, every clean fixture not
- [ ] `npm run lint` on the real repo is clean once other tasks' files exist; if it flags existing files from T3/T4, report them, do not suppress rules
- [ ] No rule is silenced by an ignore comment

**Verify:** `npm test -- tools/invariants` → expect all fixture cases passing (one `it` per rule row)

### T6 — `createAuth`

**Wave:** 2 · **Layer:** spotify · **Requirement:** F-6, F-7, F-8 · **Depends on:** T3
**Owns:** `src/spotify/auth.ts`, `src/spotify/auth.test.ts`
**Reads:** design §`src/spotify/auth.ts` (paste the signatures), `spike/playback-latency:src/auth.ts` and `auth.test.ts` (`git show`)

**Do:** implement the `Auth` contract from the design: PKCE via the injected `randomBytes`, `handleCallback` exchanging the code and calling `replaceUrl`, silent refresh in `getAccessToken`, `logout`, `redirectUriFor`; storage under `harkdle.auth` / `harkdle.pkce` holding `{ v: 1, … }`; any malformed, unversioned or unknown-version payload reads as logged out. Port and extend the spike's tests (RFC 7636 vector, scopes, refresh window).

**Invariants:** 2 (clock, RNG, `fetch`, storage and navigation injected; no `Date.now`, `Math.random`, `window`, `localStorage`), 3 (imports nothing from `store/` or `ui/`), 4 (versioned persisted shapes).

**Done when:**
- [ ] Table-driven tests: fresh token returned without a request; stale token refreshed once and the refresh token kept when the response omits it; refresh failure → `AuthError('refresh-failed')`; callback success stores `{v:1,…}`, removes the verifier, calls `replaceUrl`; callback without a verifier → `missing-verifier`; token endpoint non-2xx → `token-endpoint`; absent / garbage / `v:2` storage → `isLoggedIn() === false`; `logout` clears both keys; `redirectUriFor` dev and prod; the authorize URL carries exactly the 7 scopes and `S256`
- [ ] Two parallel `getAccessToken` calls on a stale token do one refresh
- [ ] Invariant check clean

**Verify:** `npm test -- src/spotify/auth` → expect all passing

### T7 — `checkAccount`

**Wave:** 2 · **Layer:** spotify · **Requirement:** F-9 · **Depends on:** T3 (+ declared type reference to T6)
**Owns:** `src/spotify/account.ts`, `src/spotify/account.test.ts`
**Reads:** design §`src/spotify/account.ts` (paste the signatures and the outcome table)

**Do:** implement `checkAccount` with the outcome table exactly as written, sending `Authorization: Bearer <token>` to `GET https://api.spotify.com/v1/me`; any throw from `getAccessToken` maps to `session-expired`, so the only import from `./auth` is `import type { FetchFn }`.

**Invariants:** 2 (fake `fetch` only), 3 (no `store/` or `ui/` imports).

**Done when:**
- [ ] One test per row of the outcome table, with a fake `fetch` and a fake `getAccessToken`
- [ ] `displayName` falls back to `id` when `display_name` is null
- [ ] The bearer header is asserted

**Verify:** `npm test -- src/spotify/account` → expect all passing

### T8 — Session store

**Wave:** 3 · **Layer:** store · **Requirement:** F-7, F-8, F-9, F-10 · **Depends on:** T6, T7
**Owns:** `src/store/session.ts`, `src/store/session.test.ts`
**Reads:** `src/spotify/auth.ts`, `src/spotify/account.ts`, design §`src/store/session.ts`

**Do:** implement `createSessionStore` per the design: the `Screen` union, `boot` order, `login`, `retry`, `logout`, re-entry guards, and `export type { AccountUser } from '@/spotify/account'`. Tests use fake `Auth` and fake `checkAccount`.

**Invariants:** 1/3 (no React, no `ui/` imports; Zustand vanilla only), 2 (all effects through `SessionDeps`).

**Done when:**
- [ ] Each `boot` branch has a test: missing client ID; dev on `localhost` → `wrong-origin`; production on any host skips the origin check; callback exchange throws; logged out → `login`; logged in + each of the four `AccountFailure` results + success
- [ ] `retry` on `session-expired` logs out and shows `login`; `retry` after `unexpected` re-checks
- [ ] Double `boot()` / `retry()` while `checking` makes one `checkAccount` call
- [ ] `login` failure → `unexpected`; `logout` → `login`

**Verify:** `npm test -- src/store/session` → expect all passing

### T9 — Login screen

**Wave:** 4 · **Layer:** ui · **Requirement:** F-11 · **Depends on:** T4, T8
**Owns:** `src/ui/LoginScreen.tsx`, `src/ui/LoginScreen.test.tsx`
**Reads:** `src/ui/primitives/*`, design §screens, epic Login row

**Do:** render a centered Card: name and one-line description of harkdle, the requirements (full Premium, on the allowlist, desktop Chrome), and a "Log in with Spotify" button calling `onLogin`. Test file opts into jsdom (`// @vitest-environment jsdom`).

**Invariants:** 3 (no `spotify/` imports; no rules restated).

**Visual requirements:** single column; dark neutral; keyboard-focusable button with a visible focus ring; readable at 1280 px and 1920 px desktop widths.

**Done when:**
- [ ] The test finds the requirements text and calls `onLogin` on click
- [ ] Typecheck and lint clean
- [ ] Human look at desktop width happens in T11

**Verify:** `npm test -- src/ui/LoginScreen` → expect all passing

### T10 — Setup error screen

**Wave:** 4 · **Layer:** ui · **Requirement:** F-10, F-11 · **Depends on:** T4, T8
**Owns:** `src/ui/SetupErrorScreen.tsx`, `src/ui/SetupErrorScreen.test.tsx`
**Reads:** `src/ui/primitives/*`, `src/store/session.ts` (for `SetupErrorKind`), design §screens copy list

**Do:** render the Alert + Card for each `SetupErrorKind` with a title, one message, one fix (copy per design), `detail` when present, `devUrl` for `wrong-origin`, a Retry button (hidden for `wrong-origin` and `missing-config`) and a Log out button.

**Invariants:** 3 (type import from `@/store/session` only).

**Visual requirements:** same as T9.

**Done when:**
- [ ] A table-driven test covers all eight kinds: expected title text, Retry present or absent, `detail` and `devUrl` shown when given
- [ ] `onRetry` / `onLogout` fire
- [ ] Typecheck and lint clean

**Verify:** `npm test -- src/ui/SetupErrorScreen` → expect all passing

### T11 — Compose the app and run the browser check

**Wave:** 5 · **Layer:** — (integration) · **Requirement:** F-6, F-8, F-10 · **Depends on:** T8, T9, T10
**Owns:** `src/main.tsx`, `src/App.tsx`, `src/ui/SignedInShell.tsx`
**Reads:** the files from T6–T10, design §Composition root

**Do:** replace T3's entry with the composition root from the design: real `AuthDeps` from the browser, the store, `boot()`, and `App` selecting a screen with `useStore`; `SignedInShell` shows the display name and a Log out button (a stand-in for item 2). `booting` and `checking` render a plain "Loading…" line.

**Invariants:** the only place ambient browser APIs appear (2); no rules.

**Done when:**
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` all pass
- [ ] The orchestrator drives the flow in desktop Chrome at `http://127.0.0.1:5173` with the user's Spotify client ID: Login → consent → signed-in shell; reload keeps the session; Log out → Login
- [ ] `http://localhost:5173` shows `wrong-origin`; an empty client ID shows `missing-config` (via a temporary env override, reverted)
- [ ] Human sign-off on both screens at desktop width

**Verify:** `npm run typecheck && npm run lint && npm test && npm run build`

### T12 — Fill the feature-dev profile

**Wave:** 6 · **Layer:** docs (orchestrator) · **Requirement:** F-5 · **Depends on:** T5, T11
**Owns:** `.claude/skills/feature-dev/SKILL.md`, `.claude/skills/README.md`, `specs/foundation/*` (status)
**Reads:** `package.json`, `biome.json`

**Do:** replace the TBD rows in SKILL.md's Project profile with the real stack, package manager, layout (the four layers and their folders), persistence and hosting; gates with the exact script names from `package.json` (typecheck, lint, test, one-suite `npm test -- <path>`, build, invariants = `npm run lint` + `npm test -- tools/invariants`); the invariants table with a "Enforced by" column (1, 2, 3, 5 → Biome + fixture test; 4 → tests); drop the "stack is TBD" paragraph. Update the README note in `.claude/skills/`. Set the specs' status.

**Done when:**
- [ ] Every gate command in the profile is run once and its output seen
- [ ] No TBD left in the profile
- [ ] Each invariant names the mechanism that checks it

**Verify:** `npm run typecheck && npm run lint && npm test && npm run build`

## Requirement trace (filled in at the end)

| Req | Tasks | Result |
| --- | ----- | ------ |
| F-1 | T1 | — |
| F-2 | T2 | — |
| F-3 | T3, T4, T11 | — |
| F-4 | T5, T6 | — |
| F-5 | T12 | — |
| F-6 | T6, T8, T9, T11 | — |
| F-7 | T6, T7, T8 | — |
| F-8 | T6, T8, T11 | — |
| F-9 | T7, T8, T10 | — |
| F-10 | T8, T10, T11 | — |
| F-11 | T4, T9, T10 | — |
