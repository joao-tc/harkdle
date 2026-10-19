# Design & Tech Stack Validation

Review of `game-design.md` and `harkdle_techstack_and_hosting.md`, checked against Spotify's current docs (Oct 2026).

**Verdict:** the design and the stack mostly hold up. Two areas need action before building: a Spotify playback spike, and about eight rules in the design that are still ambiguous.

## What checks out

- **Dev Mode limits:** the Premium owner, the 5-user cap and playlist items only for owned or collaborative playlists all match Spotify's [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).
- **Redirect URIs:** Spotify requires HTTPS except for loopback IP literals, and `localhost` is rejected ([redirect URI docs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)). The `127.0.0.1` setup is correct, and so is using PKCE.
- **Premium Lite and Mini:** these don't work with the SDK, as the [Web Playback SDK docs](https://developer.spotify.com/documentation/web-playback-sdk) and a [community thread](https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-working-with-Spotify-Lite-Premium-Mini/m-p/7269882/highlight/true) confirm.
- **ISRC dedupe:** `external_ids` was removed in February, but Spotify [reverted that in March](https://developer.spotify.com/documentation/web-api/references/changes/march-2026). Dedupe by ISRC still works.
- **Scoring math:** the artist (30%) and album (50%) columns, the 2700 and 2600 maxima and the cap at 50% all agree with each other.

## Things that will bite

1. **The region filter has no data source.** `available_markets` is removed from tracks and albums. The migration guide doesn't list `is_playable` as removed, so the likely fix is to request items with `market=from_token` and filter on `is_playable`. This is unconfirmed in Dev Mode, so test it first.
2. **The endpoint and fields were renamed.** Playlist contents now come from `GET /playlists/{id}/items`, and `tracks.track` became `items.item`. Many tutorials still use the old names. The guide says missing fields should be handled gracefully.
3. **Clip timing is the biggest technical risk.** A 1s clip, or a 0.5s one, is on the order of the SDK's seek and buffer latency. Every step replays from the same start point, which means a seek each time.
   - The SDK streams DRM-protected audio, so there is no preloading and likely a gap between rounds.
   - Do a one-day spike before locking the numbers. Measure the real audible clip length and the seek-to-sound delay for 0.5s, 1s and 2s.
   - Use `position_ms` on the play call for the start point, and enforce the clip end by watching the playback position, not a plain `setTimeout`.
4. **Auth details the stack doc skips.**
   - The scopes aren't listed. You'll need `streaming`, `user-read-private`, `playlist-read-private`, `playlist-read-collaborative` and `user-modify-playback-state`, and probably `user-read-playback-state`.
   - The SDK's token callback needs refresh-token handling, or playback dies after an hour.
   - iOS needs a user gesture before audio starts.
   - Friends have to be allowlisted by email and need their own Premium. The game is single-player, so "played with friends" works only for up to 5 people.

## Design gaps (these would become ledger rows)

- **Matching:** is a guess correct by track ID or by normalized string? Titles like "Song - Remastered 2011" and "Song (feat. X)", and tracks sharing a title across artists, break exact string matching.
- **Main versus featured artist:** Spotify doesn't mark this. The likely rule is that `artists[0]` is main and the rest are featured, which is wrong for "A & B" collaborations. The partial credit value is already open in the design doc.
- **Reroll penalty:** is it 10% linear (1 − 0.1n) or compounding, and does it stack within one round?
- **Same-submission step:** if a submission has one correct and one wrong field, the correct one locks at the current step and then the step advances. The doc implies this but never says it.
- **Short tracks:** the 10–70% range and the "16s + margin remaining" rule conflict for tracks under about 30s. Clamp to the upper bound, or fall back to 0:00.
- **X Tracks edge cases:** X greater than the cleaned playlist size, and a minimum playlist size.
- **Session interruptions:** reload mid-game, tab hidden or backgrounded, and Spotify already playing on another device.
- **Autocomplete difficulty:** options are built from the playlist, so a small playlist is much easier. Decide whether that is intended.

## Stack notes

- **Engine design:** keep the game engine a pure reducer with an injected RNG and clock, and put the Spotify player behind a small adapter interface. Zustand then holds both. This is what makes Vitest useful, because the DRM-protected player can't run in CI.
- **Routing:** the router is optional. There are about four screens, and a refresh mid-game loses state anyway. Drop TanStack Router unless you want shareable settings URLs. Hash history and the plain-root redirect on Pages are otherwise fine, and the trailing slash in the redirect URI must match exactly.
- **Missing gates:** there's no `tsc` typecheck or linter (Biome or ESLint) in the stack. Browser tests would need a mocked player. The `feature-dev` skill's Project profile needs these gates.
- **Secure context:** EME needs a secure context. `127.0.0.1` counts as one, so local dev should work, but check it in the spike.

## Playback latency: options

Downloading the track to avoid latency is not possible. The SDK streams DRM-protected audio with no access to raw audio, Spotify's developer policy forbids downloading or caching content, and `preview_url` was removed for new apps in late 2024.

What the SDK allows instead:

1. **Pre-seek while paused.** Play with `position_ms`, pause immediately, wait for `player_state_changed`, then resume on the player's action. For each replay step, seek back to the start while paused and resume. Whether the buffer survives a pause is what the spike measures.
2. **Hide the cold start in the reveal screen.** Load the next round's track at its start position and pause it while the result screen shows.
3. **Measure the clip from the first audible position change**, not from the play call. Enforce the end by polling position, and compensate for the measured seek-to-sound delay if it is stable.
4. **Put a floor on the shortest step.** If jitter is a few hundred ms, start at 1s or use a 1/2/4/8/16s ladder.

**Fallback if the SDK can't deliver short clips:** Deezer's public 30s MP3 previews, looked up by ISRC and clipped locally with Web Audio. Costs: start points limited to the 30s preview (conflicts with the 10–70% rule), unmatched tracks, and a second service with its own terms.

## Next steps

1. Run the playback spike first, on a throwaway `spike/playback-latency` branch off main. It never merges. What comes back is the findings, and the adapter interface if it turns out well. Timebox it to one day and one question: can the SDK give a fair 0.5s, 1s or 2s clip? It needs:
   - A minimal page on `127.0.0.1` with PKCE login, the scopes from item 4 and the SDK player.
   - A test over about 20 tracks comparing the pre-seek flow (seek paused, then resume) against the cold flow (play with `position_ms`). Per run, log the time from the resume call to the first position change and the actual audible duration. Report median and spread per clip length.
   - A check of `market=from_token` with `is_playable`, and of the `/items` endpoint.
2. Record the result as a short note or the first ADR, with the clip lengths to lock in or the fallback to take.
3. Write the stack as ADR-0001 and fill in the `feature-dev` Project profile, with the scopes, `market=from_token` and the adapter seam as constraints.
4. Start the real build on a fresh branch from main, with the spike as the first feature through `feature-dev`.

## Sources

- [Web API Changelog - February 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [February 2026 Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Web API Changelog - March 2026](https://developer.spotify.com/documentation/web-api/references/changes/march-2026)
- [Redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)
- [Reminder: OAuth Migration - 27 November 2025](https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025)
