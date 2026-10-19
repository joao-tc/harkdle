# Song Guessing Game — Tech Stack & Hosting

Oct 19, 2026 · @João Carvalho

## Running locally

The game runs fully on your machine. The browser talks straight to Spotify for the API calls and playback, so nothing has to be hosted.

The one restriction is the **redirect URI**, where Spotify sends you after login. Spotify no longer accepts the hostname `localhost`, but it accepts the loopback IP over plain HTTP.

- Register `http://127.0.0.1:5173/callback` in the Spotify dashboard.
- Run Vite on that address: `server: { host: '127.0.0.1', port: 5173, strictPort: true }`.
- Open the app at `127.0.0.1`, not `localhost`. Otherwise the PKCE verifier saved before login is in a different origin's storage when Spotify redirects back.

## Hosting on GitHub Pages

Pages replaces Amplify, since the game is a static SPA. Two details matter because Pages has no rewrite rules.

1. **Base path.** The site lives at `https://<user>.github.io/<repo>/`. Set `base: '/<repo>/'` in Vite and `basepath: '/<repo>'` in TanStack Router. A custom domain, or a repo named `<user>.github.io`, avoids this.
2. **Deep routes return 404 on refresh,** because Pages never falls back to `index.html`. Use **hash history** in TanStack Router (`createHashHistory()`), giving URLs like `/<repo>/#/game?mode=endless`.
   - Make the redirect URI the plain root: `https://<user>.github.io/<repo>/`.
   - Spotify returns `?code=...` as a normal query string before the hash. Read it on app load, exchange it for a token, then clean the URL.
   - The alternative is copying `index.html` to `404.html` at build time. It keeps clean URLs, but serves pages with a 404 status and complicates the redirect.

Deploy with a GitHub Actions workflow that builds and uploads to Pages on every push to `main`. Register two redirect URIs in Spotify: the local one and the Pages one.

## Final stack

| Layer | Choice | Role |
| --- | --- | --- |
| Language & UI | React + TypeScript | App and components |
| Build | Vite | Dev server on 127.0.0.1, static build for Pages |
| Routing | TanStack Router (hash history) | Screens and typed search params for game settings |
| Server data | TanStack Query | Spotify calls, pagination, caching the cleaned track list |
| App state | Zustand | Player instance and game engine state |
| Components | shadcn + Tailwind CSS | UI; Command/Combobox for guess autocomplete |
| Tests | Vitest | Game engine and scoring |

Zustand earns its place for two reasons. The Spotify player is a long-lived object that doesn't belong in React state. The game engine must also react to SDK events like `player_state_changed`, which fire outside any component. A Zustand store holds both, and SDK callbacks and components dispatch to it alike.
