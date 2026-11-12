# harkdle

A song-guessing game that plays **your own Spotify playlists**. Pick a playlist, and harkdle shuffles it and plays each song in short, growing clips. Name the song from as little audio as you can.

**Play it:** <https://joao-tc.github.io/harkdle/>

> **Heads up:** harkdle runs in Spotify's Development Mode, so the site only works for people the owner has added to the app's allowlist (5 users at most). Everyone needs **Spotify Premium** too. If you'd like to play, ask the owner to add you. If you'd rather run your own copy, see [Run it yourself](#run-it-yourself).

## How it works

The idea comes from a game played with friends: shuffle a playlist and guess every song in as little time as possible. It borrows the clip ladder from Heardle but uses your music instead of a daily song.

### A round

Each song is revealed in six clips that get longer: **1s, 2s, 4s, 7s, 11s, 16s**. Every clip starts from the same point in the track. There is no clock, so a step only advances when you skip or guess wrong.

Three fields are open the whole round, each with autocomplete built from your playlist:

- **Title**
- **Artist.** The main artist earns full credit, and a featured artist earns half.
- **Album.** Skipped when the track is a single, EP or compilation.

Pick a suggestion from the list and submit. A correct field locks in at the current step and costs nothing. If any field in a submission is wrong, you move one step up the ladder, however many were wrong. You can also **skip** to the next clip or **give up** to reveal the song and keep the points you already locked.

Matching ignores case, accents, punctuation and version tags, so "Don't Stop (Remastered 2011)" and "Dont Stop" are the same song. Remix, acoustic, demo, instrumental and cover versions stay distinct.

### Scoring

Each field scores on its own, based on the step where you locked it:

| Step | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- |
| Title | 1000 | 800 | 600 | 400 | 250 | 100 |
| Artist (30% of title) | 300 | 240 | 180 | 120 | 75 | 30 |
| Album (50% of title) | 500 | 400 | 300 | 200 | 125 | 50 |

Get **every** required field and you score a **hat trick**: the round total is multiplied by **×1.5**, or **×2.0** when the album was skipped. A perfect step-1 round is worth 2700 points.

When the game ends you see your final score, a histogram of the step each title was guessed at (plus a "missed" column) and your hat-trick count.

### Playlists

You pick one of your own or collaborative playlists, or paste a playlist link. harkdle drops what it can't play (local files, podcast episodes, tracks unavailable in your region) and removes duplicates by track ID and ISRC, so the same recording on an album and its deluxe edition counts once. It shows how many tracks were usable and how many were removed. A playlist needs at least **10 usable tracks**.

### Game modes

| Mode | Status |
| --- | --- |
| **X Tracks** (5, 10 or 20 songs), Classic start | Playable |
| Random start, with rerolls | Planned |
| Endless (the run ends after 3 misses) | Planned |

Classic start plays every clip from 0:00. Random start will pick a different point in each song, with a few free rerolls per game and a score bonus.

## Controls

| Key | Action |
| --- | --- |
| `Enter` | Submit your guess |
| `Tab` | Move between fields |
| `⌥ Space` | Play the current clip |
| `⌥ S` | Skip to the next clip |
| `⌥ R` | Reroll the start point (when Random start ships) |

The shortcuts work while you are typing in a field and don't type any characters. Replays are free and unlimited.

## Requirements

- A Spotify account with full **Premium**. Premium Lite and Mini don't work with Spotify's Web Playback SDK.
- Your account on the app's allowlist (Development Mode limit).
- **Desktop Chrome.** Safari, Firefox and mobile haven't been tested.
- The game audio plays in the browser tab, so keep it open and in the foreground. If Spotify starts playing somewhere else, harkdle freezes the round without costing you a step and offers a "Play here" button.

## Run it yourself

You need Node.js and your own Spotify developer app. Running your own copy means you are the owner, so you can allowlist your own friends.

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard). Under **Redirect URIs**, add `http://127.0.0.1:5173/callback`. Spotify rejects `localhost`, so use the IP address.
2. Copy `.env.example` to `.env` and set `VITE_SPOTIFY_CLIENT_ID` to your app's client ID. It is not a secret, because login uses PKCE.
3. Install and start:

   ```sh
   npm install
   npm run dev
   ```

4. Open <http://127.0.0.1:5173>. Use that address, not `localhost`, or login will fail.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on `127.0.0.1:5173` |
| `npm run build` | Typecheck and build for production |
| `npm run typecheck` | Run the TypeScript checker |
| `npm run lint` | Run Biome |
| `npm test` | Run the Vitest suite |

Deploying your own copy to GitHub Pages is covered in the [deploy runbook](docs/deploy.md).

## Built with

React, TypeScript, Vite, Zustand, TanStack Query, Tailwind CSS and shadcn/ui, tested with Vitest and checked with Biome. Playback uses the Spotify Web Playback SDK, and login uses the PKCE flow, so everything runs in the browser and there is no backend.

The code is split into layers that don't leak into each other:

| Folder | Holds |
| --- | --- |
| [src/game/](src/game) | The rules: normalization, scoring and the round and game reducers. Pure and headless. |
| [src/spotify/](src/spotify) | Login, the Web API client, playlist cleaning and the playback adapter |
| [src/store/](src/store) | Zustand stores that connect the game logic to playback |
| [src/ui/](src/ui) | Screens and components |

All gameplay numbers (clip lengths, points, multipliers) live in one file, [src/game/config.ts](src/game/config.ts), so they are easy to tune after playtesting.

## More documentation

- [game-design.md](game-design.md): the full rules, including the edge cases
- [specs/app-v1/ROADMAP.md](specs/app-v1/ROADMAP.md): scope, decisions and build order for v1
- [docs/adr/](docs/adr): architecture decisions, including [how clips are timed](docs/adr/0001-stack-and-playback.md)
- [docs/deploy.md](docs/deploy.md): deploying and adding friends to the allowlist

## Disclaimer

harkdle is a personal project. It isn't affiliated with or endorsed by Spotify. Music and artwork come from Spotify and belong to their owners.
