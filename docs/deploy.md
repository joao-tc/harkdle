# Deploy runbook

harkdle is a static site on GitHub Pages at `https://joao-tc.github.io/harkdle/`. A push to `main` runs [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml): typecheck, lint, test, build, then deploy. The deploy runs only if all four pass. You can also run the workflow by hand from the Actions tab (**Run workflow**).

Menu paths below follow GitHub's and Spotify's UIs as of November 2026. Both change, so treat anything marked *needs verification* as a lead, not a promise.

## One-time setup

1. **Make the repo public.** Settings → General → Danger Zone → Change visibility. Pages on a private repo needs a paid plan. The client ID is public by design (PKCE has no secret), and `.env` is gitignored.
2. **Enable Pages.** Settings → Pages → Build and deployment → Source = **GitHub Actions**. Keep **Enforce HTTPS** on.
3. **Add the client ID as a variable, not a secret.** Settings → Secrets and variables → Actions → **Variables** tab → New repository variable. Name: `VITE_SPOTIFY_CLIENT_ID`. Value: the client ID from the Spotify dashboard.
4. **Register both redirect URIs** in the Spotify dashboard (your app → Settings → Redirect URIs):
   - `http://127.0.0.1:5173/callback` (local dev)
   - `https://joao-tc.github.io/harkdle/` (production, **with the trailing slash**)

   Spotify matches the string exactly. A missing slash is enough to break login.
5. **Deploy.** Push or merge to `main`, or run the workflow by hand. Watch it with `gh run watch`, or in the Actions tab. When it is green, open the Pages URL.

## Add a friend

Spotify's Development Mode only serves users the owner has added, capped at **5 users**. Each one needs **Spotify Premium** to play. *Needs verification:* whether the owner counts toward the 5. Check the dashboard, since Spotify's rules have changed recently.

1. Spotify dashboard → your app → **User Management**.
2. Add the friend's name and the email on their Spotify account.
3. Send them the Pages URL. Nothing else changes: no redeploy.

If the list already holds 5 users, Spotify blocks the sixth. Remove someone first.

## After changing the client ID

The ID is baked into the bundle at build time, so changing the variable does not change the live site. Re-run the workflow: Actions → Deploy → **Run workflow** on `main`, or `gh workflow run deploy.yml`. Reload the site after it finishes.

## When it fails

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| The `deploy` job is red, or the run fails on `deploy-pages` with a Pages error | The repo is still private, or Pages is not set to the **GitHub Actions** source | Do setup steps 1 and 2, then re-run the failed job. Check this first. |
| The `build` job fails at "Check the Spotify client ID is configured" | The `VITE_SPOTIFY_CLIENT_ID` repository variable is missing or empty | Setup step 3. It must be under **Variables**, not Secrets. Re-run the workflow. |
| The `build` job fails at typecheck, lint or test | A real regression on `main`. Nothing was deployed | Fix it and push. The previous site stays live. |
| Spotify shows `INVALID_CLIENT: Invalid redirect URI` | The dashboard's redirect URI differs from the live URL | Set it to exactly `https://joao-tc.github.io/harkdle/`, trailing slash included. |
| The app shows **Not on the allowlist** | The account's email is not in User Management, or the list is full | Add the email (see Add a friend), then have them retry. |
| The app shows **App not configured** | The build had no client ID | Fix the variable and re-run the workflow. |
| The site still uses an old client ID after changing the variable | The old bundle is still deployed or cached | Re-run the workflow, then hard-reload the page. |
| `http://` URL does not load the app | Enforce HTTPS is off | Settings → Pages → Enforce HTTPS. GitHub redirects `http://` to `https://` when it is on. |

Two runs started close together deploy one at a time. The latest one wins, and a deploy already in progress is not cancelled.
