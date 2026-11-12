# Deploy — spec

**Size:** Medium
**Sub-phase:** single
**Status:** Implemented — deployed from `stage`; the live login check and the gate-block proof are pending

Roadmap item 4 of [app-v1](../app-v1/ROADMAP.md). Realises R19 and ADR-0001's hosting choice. No new ADR: GitHub Pages, no routing and PKCE without a secret are already decided.

## Problem

The game only runs on `http://127.0.0.1:5173`. Friends can't play it until the site is built and published to GitHub Pages and Spotify accepts the Pages URL as a redirect URI. Spotify's Development Mode (as of February 2026) caps the app at **5 authorized users**, so the deploy is for the owner and up to 4 friends (A3 in the roadmap). Opening it to everyone would need Extended Quota Mode, which is out of reach for now.

## Ambiguity ledger

| ID | Question | Status | Answer |
| -- | -------- | ------ | ------ |
| A1 | The repo is private, and GitHub Pages from a private repo needs a paid plan. What now? | Resolved | **Make the repo public** (Free-plan Pages). The history was scanned: `.env` was never committed, and no tokens or secrets were found. The Spotify client ID is public by design (PKCE). The visibility flip is outward-facing, so it happens only when the owner confirms it at execution (T4). |
| A2 | Which URL and base path? | Resolved | `https://joao-tc.github.io/harkdle/`. Vite `base` is `/harkdle/` for builds and `/` for dev. The production redirect URI is exactly that URL, trailing slash included. |
| A3 | What does CI run before publishing? | Resolved | `typecheck`, `lint`, `test`, then `build`. The deploy job runs only if all four pass. |
| A4 | 107 commits carry the owner's personal Gmail address, which a public repo exposes. | Resolved | Accept it. No history rewrite. |
| A5 | Where does the client ID live in CI? | Resolved | An Actions **repository variable** named `VITE_SPOTIFY_CLIENT_ID`, not a secret. The build fails early if it is empty. |
| A6 | Do pull requests also run the gate? | Resolved | No. Deploys from `stage` only (A8). A PR-check workflow is deferred. |
| A7 | Who is allowed to play? | Resolved (roadmap A3) | The owner plus up to 4 friends in the Spotify dashboard's User Management, each with Premium. |
| A8 | Which branch deploys? | Resolved | **`stage`**, not `main`. `main` keeps merging as normal and `stage` is promoted when a change should go live. The `github-pages` environment must allow `stage` (Settings → Environments → `github-pages`), since it only allows the default branch at first. |

**Open: 0**

Category sweep: scope ✅ (Out of scope) · rules ✅ (n/a, no game rules) · layer ✅ (no `src/` layer changes: config, CI and docs only) · build order ✅ (item 0 is done, the game loop (5b) is merged) · data ✅ (n/a; `harkdle.*` keys are per-origin, so the Pages origin starts empty) · time/random ✅ (n/a) · behavior ✅ (R19 flow, Edge cases) · errors ✅ (Edge cases) · contracts ✅ (`redirectUriFor(location, BASE_URL, dev)` already yields `origin + BASE_URL` in production, so no code change; the only new contract is the `VITE_SPOTIFY_CLIENT_ID` variable) · platform ✅ (desktop Chrome, roadmap A4) · non-functional ✅ (build size and load time are unchanged by this item; not measured here) · fairness ✅ (n/a) · done ✅ (Done when)

## Requirements

| ID | Requirement | Priority |
| -- | ----------- | -------- |
| D1 | WHEN a commit lands on `stage` THEN the workflow SHALL run typecheck, lint and test, then build, and SHALL deploy to Pages only if all four pass. | P1 |
| D2 | WHEN CI builds THEN it SHALL inject `VITE_SPOTIFY_CLIENT_ID` from the repository variable, and SHALL fail before building, with a message naming the variable, if it is empty. | P1 |
| D3 | WHEN the app is built for production THEN every asset URL SHALL be under `/harkdle/`. `npm run dev` SHALL keep serving from `/` at `http://127.0.0.1:5173`. | P1 |
| D4 | WHEN a player logs in at `https://joao-tc.github.io/harkdle/` THEN the redirect URI sent to Spotify SHALL be exactly that URL, and login SHALL complete and land on the picker. (R19) | P1 |
| D5 | WHEN two pushes land close together THEN deployments SHALL run one at a time, the latest SHALL win, and an in-progress deploy SHALL NOT be cancelled. | P2 |
| D6 | WHEN the workflow runs THEN its token SHALL hold only the permissions Pages needs: `contents: read`, `pages: write`, `id-token: write`. | P2 |
| D7 | WHEN the owner changes the client ID variable THEN a manually triggered run (`workflow_dispatch`) SHALL rebuild and redeploy without a code change. | P2 |
| D8 | WHEN the owner needs to add a friend or recover from a failed deploy THEN `docs/deploy.md` SHALL give the exact steps: one-time setup, the add-a-friend procedure and common failures. | P2 |
| D9 | WHEN an account that is not on the allowlist logs in on the deployed site THEN the existing "Not on the allowlist" Setup error SHALL appear. This is verified live, with no code change. | P1 |

## Edge cases

- WHEN `VITE_SPOTIFY_CLIENT_ID` is unset THEN the CI job fails at the check step. It SHALL NOT ship a site that shows "Set VITE_SPOTIFY_CLIENT_ID in .env" to players.
- WHEN Pages is not enabled with the Actions source, or the repo is still private, THEN the first deploy fails. `docs/deploy.md` lists this as the first thing to check.
- WHEN the redirect URI in the Spotify dashboard differs from the live URL, even by a missing trailing slash, THEN Spotify shows `INVALID_CLIENT: Invalid redirect URI`. `docs/deploy.md` documents the exact string.
- WHEN the client ID variable is changed THEN existing builds keep the old ID until the workflow is re-run (D7), because the ID is baked in at build time.
- WHEN the friend allowlist already holds 5 users THEN adding a sixth is blocked by Spotify. The runbook states the cap.
- WHEN a friend opens `http://joao-tc.github.io/harkdle/` over plain HTTP THEN GitHub redirects to HTTPS. The Pages "Enforce HTTPS" setting stays on.

## Out of scope

| Excluded | Reason |
| -------- | ------ |
| Custom domain | A2. The project URL is enough for friends. |
| Open signups, Extended Quota Mode | A cap of 5 users is the whole premise of option 1. |
| PR check workflow, preview deploys | A6. Deferred. |
| Other hosts (Cloudflare, Netlify) | ADR-0001. |
| Rewriting git history | A4. |
| `404.html` fallback and hash routing | No URL routing (roadmap A1). |
| Safari, Firefox, mobile | Roadmap A4. |
| Bundle-size and load-time budgets | Not changed by this item. |

## Done when

- [ ] `npm run typecheck`, `npm run lint` and `npm test` are green locally with no `.env`, and `VITE_SPOTIFY_CLIENT_ID=x npm run build` writes a `dist/index.html` whose asset URLs all start with `/harkdle/` (D3).
- [x] A push to `stage` runs the workflow green end to end and publishes `https://joao-tc.github.io/harkdle/` (D1, D2, D5, D6).
- [ ] In desktop Chrome on the Pages URL, the owner logs in and reaches the picker (D4).
- [ ] An allowlisted friend logs in and reaches the picker, and an account that is not on the list sees the allowlist screen (D9). This also counts toward the roadmap's "every Setup error screen reached" box.
- [ ] A forced failure of the gate (or an emptied variable) is shown to block the deploy once (D1, D2).
