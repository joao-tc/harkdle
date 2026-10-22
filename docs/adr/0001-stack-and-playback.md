# ADR-0001 — Client-only React SPA on GitHub Pages, playing clips through the Spotify Web Playback SDK with cued starts

**Status:** Proposed
**Date:** 2026-10-22

## Context

harkdle is a Heardle-style game built on the player's own Spotify library. Spotify gives no raw audio, so clips can only play through the Web Playback SDK. That requires full Premium (not Lite or Mini) and, in Dev Mode, an allowlist of at most 5 users. The biggest risk was whether the SDK can play a fair 1 s clip.

The playback spike ([findings](../spike-playback-latency.md)) answered that:
- A clip started cold takes about 550 ms to begin.
- A clip cued in advance starts in about 19 ms with roughly 1 ms of spread.
- Most clips end within 10–40 ms of the target, with a tail of up to about 275 ms.

The stack had been chosen in [harkdle_techstack_and_hosting.md](../../harkdle_techstack_and_hosting.md) but never recorded as a decision.

## Decision

**Stack**

The app is a static, client-only SPA. There is no backend.

| Layer | Choice |
| --- | --- |
| Language and UI | React + TypeScript |
| Build | Vite, dev server on `127.0.0.1:5173` |
| Routing | TanStack Router with hash history |
| Server data | TanStack Query |
| App state | Zustand, holding the player instance and game engine state |
| UI | shadcn + Tailwind CSS |
| Tests | Vitest |
| Hosting | GitHub Pages, deployed by GitHub Actions on push to `main` |

**Auth**

- Use Authorization Code + PKCE, with the client ID in `VITE_SPOTIFY_CLIENT_ID`.
- Register two redirect URIs: `http://127.0.0.1:5173/callback` and the Pages root.
- Request exactly these scopes: `streaming user-read-private user-read-email user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative`. The SDK rejects the token without `user-read-email`.

**Playlist data**

- Read playlists with `GET /playlists/{id}/items?market=from_token`.
- Each entry's object is under `items[].item`.
- Filter on `item.is_playable` and deduplicate by `item.external_ids.isrc`.

**Playback**

All playback goes through one `PlaybackAdapter` seam, which contains no SDK types. Its implementation follows these rules:

1. **Cue every clip before it can be played.** The sequence is: `PUT /me/player/play` with `position_ms`, then wait until the state reports this track playing, then pause, then wait for the paused state, then seek to the start point.
2. **Start the clip with `resume()`,** and stop it by polling the position against the target.
3. **Confirm every command from the player state, not from the promise.** For pause and seek, try the SDK call, wait up to 1.5 s for the state to confirm it, then fall back to `PUT /me/player/pause` or `PUT /me/player/seek`.
4. **Match tracks by `uri` or by `linked_from.uri`,** because Spotify relinks tracks at playback time. Ignore state that describes any other track.
5. **Reconnect the SDK device** when a play command returns 404.

**Clip ladder**

The ladder stays as in `game-design.md`: 1s, 2s, 4s, 7s, 11s, 16s. A 0.5 s first step is deferred to playtesting.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Start each clip cold (`play` with `position_ms`) | About 550 ms before audio, with 60–150 ms of spread. The player hears a variable delay on every replay. |
| Trust SDK promises for pause and seek | Nothing confirms the command took effect. The SDK pause right after a Web API play was ignored in 66 of 66 runs, and the SDK seek in 13 of 38. |
| Web API only, without the SDK | The game needs a playback device in the page. Without the SDK it depends on the player having another Spotify app open and adds a network round trip to every command. |
| Backend for token exchange or hosting with rewrites | PKCE needs no secret. GitHub Pages is free, and hash history avoids its missing rewrites. |
| Deezer or preview-URL fallback | Not needed. The SDK meets the bar once clips are cued. |

## Consequences

**Good**
- Cued clips start promptly and consistently.
- There is no server to run or pay for.
- The adapter seam keeps the SDK's quirks in one file.

**Bad**
- Every player needs full Premium, and Dev Mode allows only 5 allowlisted users.
- The app is desktop Chrome only until Safari and mobile are tested.
- Every clip has a hidden cueing step that the UI must cover, for example during the reveal. It takes about 0.5 s for playback to start, plus the pause and seek. The full step was not timed end to end.
- Clip ends can overshoot by up to about 275 ms.
- Timing is measured from SDK-reported positions, not from the audio.

**Follow-ups**
- Extract `PlaybackAdapter` (spike task T9).
- Revise the A5 pass bar for the game, for example median |overshoot| ≤ 50 ms and no run over 300 ms.
- Fill in the feature-dev Project profile and gates from this ADR.
- Test Safari and mobile.
- Run the edge-case playlist through the playlist check.
