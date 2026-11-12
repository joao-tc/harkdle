# Deploy — tasks

**Spec:** [spec.md](spec.md) · **Design:** none (no architectural decision; ADR-0001 already covers Pages)
**Status:** Implemented (T1–T3 done; first deploy from `stage` ran green; live check pending)

## Execution plan

| Wave | Tasks | Mode | Commit |
| ---- | ----- | ---- | ------ |
| 1 | T1, T2, T3 | parallel, 3 subagents | one per task: `build: serve the production build under /harkdle/` · `ci: deploy main to GitHub Pages` · `docs: add the deploy runbook` |
| 2 | T4 | sequential, orchestrator with the owner (manual) | no commit until the runbook needs a fix. Then `docs: mark deploy done in the roadmap`. |

Work happens on a branch from `main` (`feat/4/deploy`). Merging that branch is what triggers the first real deploy, so T4's manual prerequisites come before the merge.

## Validation

**A — Granularity: ✅ · B — Dependencies: ✅ · C — File ownership: ✅**

### A — Granularity

| Task | Scope | Verdict |
| ---- | ----- | ------- |
| T1 | `base` in the Vite config + the test that proves it | ✅ Atomic |
| T2 | One workflow file (gate job, deploy job) | ⚠️ Cohesive (one file, two jobs) |
| T3 | One runbook file | ✅ Atomic |
| T4 | Manual prerequisites, first deploy, live check, roadmap update | ⚠️ Cohesive (one release procedure; not a subagent task) |

### B — Dependency cross-check

| Task | Depends on | Wave | Deps satisfied in an earlier wave? |
| ---- | ---------- | ---- | ---------------------------------- |
| T1 | — | 1 | ✅ |
| T2 | — | 1 | ✅ (reads T1's contract from the spec, not its output) |
| T3 | — | 1 | ✅ (reads the spec, not T2's output) |
| T4 | T1, T2, T3 | 2 | ✅ |

### C — File-ownership disjointness

| Wave | Task | Layer | Owns | Collision? |
| ---- | ---- | ----- | ---- | ---------- |
| 1 | T1 | config | `vite.config.ts`, `tools/viteConfig.test.ts` | — |
| 1 | T2 | CI | `.github/workflows/deploy.yml` | — |
| 1 | T3 | docs | `docs/deploy.md` | — |
| 2 | T4 | integration | `specs/app-v1/ROADMAP.md`, `specs/deploy/spec.md` (status only) | — |

No wave-1 task writes `package.json` or the lockfile: the plan adds no dependency and no script. No task touches `src/`, so invariants 1–5 are unaffected, but `npm run lint` and `npm test -- tools/invariants` still run as the gate.

## Tasks

### T1 — Serve the production build under `/harkdle/`

**Wave:** 1
**Layer:** config (build)
**Requirement:** D3, D4
**Depends on:** —
**Owns:** `vite.config.ts`, `tools/viteConfig.test.ts`
**Reads:** `src/main.tsx` (`BASE_URL` use), `src/spotify/auth.ts` (`redirectUriFor`), `tools/invariants.test.ts` (how tools tests import and run)

**Do:** Change `defineConfig` to the function form so `base` is `/harkdle/` when `command === "build"` and `/` when serving, keeping every other option as it is, and add a test that resolves the config for both commands and asserts `base`, so it cannot silently regress.

**Invariants:** none apply to `src/`. The dev server stays on `127.0.0.1:5173`, never `localhost`.

**Done when:**
- [ ] `base` is `/harkdle/` for `build` and `/` for `serve`. The `server` block and the `test` block are untouched.
- [ ] The new test fails if `base` changes for either command.
- [ ] `VITE_SPOTIFY_CLIENT_ID=x npm run build` succeeds, and every `src=`/`href=` in `dist/index.html` that points to an asset starts with `/harkdle/`.
- [ ] `npm test` is green with no `.env` present, and `npm run lint` is clean.

**Verify:** `npm test -- tools/viteConfig` → expect 2 passing, then `VITE_SPOTIFY_CLIENT_ID=x npm run build && grep -E '(src|href)="/' dist/index.html` → every match starts with `/harkdle/`.

### T2 — GitHub Actions workflow: gate, build, deploy to Pages

**Wave:** 1
**Layer:** CI
**Requirement:** D1, D2, D5, D6, D7
**Depends on:** —
**Owns:** `.github/workflows/deploy.yml`
**Reads:** `package.json` (script names), `specs/deploy/spec.md` (A3, A5, A6, D1–D7)

**Do:** Write one workflow with triggers `push` to `stage` (changed from `main`, spec A8) and `workflow_dispatch`, a `build` job (checkout, Node with npm cache, `npm ci`, a step that fails with a message naming `VITE_SPOTIFY_CLIENT_ID` if `vars.VITE_SPOTIFY_CLIENT_ID` is empty, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, upload the Pages artifact from `dist`), and a `deploy` job that needs `build`, targets the `github-pages` environment and uses `actions/deploy-pages`.

**Invariants:** none apply to `src/`. Workflow-level `permissions` are exactly `contents: read`, `pages: write`, `id-token: write` (D6), and the concurrency group is `pages` with `cancel-in-progress: false` (D5). The variable goes to the build step only through `env`, never echoed.

**Done when:**
- [ ] Triggers, permissions and concurrency match the spec. There is no `pull_request` trigger (A6).
- [ ] The step order is gate first, then build, then upload, with deploy in its own job.
- [ ] Action versions are the **current major tags, checked against each action's latest release at execution time** (`actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact`, `actions/deploy-pages`). Do not copy versions from memory.
- [ ] The Node version is one the repo's toolchain supports (Vite 8, Vitest 5, TypeScript 7), confirmed from their `engines` fields in `node_modules`, not assumed.
- [ ] The YAML parses. A local check such as `node -e` with an available YAML parser, or `actionlint` if installed, passes. The task does not add a dependency to do this.

**Verify:** `npx --yes --package=yaml node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'))"` → exits 0, and `actionlint .github/workflows/deploy.yml` if available. The real proof is T4's first run.

### T3 — Deploy runbook

**Wave:** 1
**Layer:** docs
**Requirement:** D8
**Depends on:** —
**Owns:** `docs/deploy.md`
**Reads:** `specs/deploy/spec.md`, `src/ui/SetupErrorScreen.tsx` (the exact error titles), `harkdle_techstack_and_hosting.md`

**Do:** Write a short runbook covering the one-time setup, the "add a friend" procedure and a failure table. It states: the repo must be public; Settings → Pages → Source = GitHub Actions; the `VITE_SPOTIFY_CLIENT_ID` repository variable; the Spotify dashboard redirect URIs `http://127.0.0.1:5173/callback` and `https://joao-tc.github.io/harkdle/` (exact, with the trailing slash); User Management with the cap of 5 and the Premium requirement; re-running the workflow after a variable change.

**Invariants:** none.

**Done when:**
- [ ] Every command and menu path in it is checked against GitHub's current UI or docs, or marked "needs verification".
- [ ] It does not hard-code the real client ID or any email address.
- [ ] The failure table covers: red deploy on a private repo or with Pages not enabled; the empty-variable failure; `INVALID_CLIENT: Invalid redirect URI`; "Not on the allowlist"; a stale bundle after changing the variable.
- [ ] `npm run lint` is clean.

**Verify:** `npm run lint` → clean. Read-through against `specs/deploy/spec.md` D8.

### T4 — Prerequisites, first deploy and live check

**Wave:** 2
**Layer:** integration (manual, owner plus orchestrator)
**Requirement:** D1, D2, D4, D9
**Depends on:** T1, T2, T3
**Owns:** `specs/app-v1/ROADMAP.md`, `specs/deploy/spec.md` (status line only)
**Reads:** `docs/deploy.md`, the workflow run logs

**Do:** In order, each step needing the owner's explicit go-ahead because it is outward-facing:
1. Run the full gate locally: `npm run typecheck && npm run lint && npm test && VITE_SPOTIFY_CLIENT_ID=x npm run build`.
2. **Owner:** flip the repo to public (Settings → General → Danger Zone). Set the git author email as the owner prefers going forward (the history stays, A4).
3. **Owner:** Settings → Pages → Source = GitHub Actions. Settings → Secrets and variables → Actions → Variables → add `VITE_SPOTIFY_CLIENT_ID`.
4. **Owner:** in the Spotify dashboard, add `https://joao-tc.github.io/harkdle/` as a second redirect URI. Under User Management, add each friend's name and Spotify email, up to the cap. Confirm in the dashboard whether the owner counts toward the 5.
5. Merge the branch and watch the workflow run to green (`gh run watch`).
6. **Live check in desktop Chrome on the Pages URL:** the owner logs in and reaches the picker; a friend does the same; an account that is not on the list sees "Not on the allowlist".
7. Prove the gate blocks once: re-run with the variable emptied (or a deliberately failing test on a throwaway branch), and confirm there is no deploy.
8. Update the roadmap's item 4 row to Done with a link to the spec, and tick the matching "Done when" lines.

**Done when:**
- [ ] The five "Done when" boxes in the spec are checked, each with evidence (run URL, what was seen).
- [ ] The roadmap's `Needs verification` section is updated if the live check settles the dashboard-cap question (does the owner count in the 5).

**Verify:** `gh run list --workflow=deploy.yml --limit 1` → `completed success`, and the live check above.

## Risks

- Going public cannot be quietly undone: cached or forked copies persist. The history scan found no secrets, and A4 accepts the Gmail address.
- A Spotify policy change (the February 2026 rules are recent) could alter the 5-user cap or the Premium requirement. D8's runbook should say "verify in the dashboard".
- The dashboard's treatment of the owner in the 5-user count is not documented in what I could read. T4 step 4 settles it by looking.
