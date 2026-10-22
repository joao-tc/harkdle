# Playback latency spike — findings

**Date:** 2026-10-22 · **Branch:** `spike/playback-latency` · **Spec:** [specs/playback-spike/spec.md](../specs/playback-spike/spec.md)
**Data:** [spike-data/playback-spike-2026-10-22T12-00-44-440Z.json](spike-data/playback-spike-2026-10-22T12-00-44-440Z.json): desktop Chrome 155 on macOS, 91 runs. Every number below comes from this file unless marked otherwise.

## Verdict

The Web Playback SDK can deliver the clip ladder in `game-design.md` (1s, 2s, 4s, 7s, 11s, 16s), **provided every clip is cued before it plays**.

- **Starting a cued clip is fast and consistent.** A cued clip is one where the track is loaded, paused at the start point, and resumed on the player's action. Resume to first position change takes about 19 ms with a spread of about 1 ms. A cold start (`play` with `position_ms`) takes about 550 ms with a spread of 60 to 150 ms.
- **Clip ends are good on average but have a tail.** The median overshoot of the cued cells is 10 to 40 ms. 12 of 66 cued runs (about 1 in 5) overshoot by 113 to 274 ms.
- **The strict A5 bar fails anyway.** A5 requires a worst-case overshoot of at most 100 ms, and the tail breaks that in every cued cell. An informal listen during the run found the clips audibly fine. A2 deliberately excludes ear tests, so that observation isn't evidence, but it is why the recommendation below proposes relaxing A5 rather than taking the fallback.
- **Keep 1 s as the first step.** A 0.5 s first step is technically possible. On a 0.5 s clip, though, the overshoot tail is about 40% extra audio, so it needs playtesting before adoption.

## Results per cell

These are the A5 definitions as implemented in [`src/stats.ts`](../src/stats.ts):
- **Latency** is the time from the resume (or play) call to the first reported position change.
- **IQR** is the spread of latency, the 25th to 75th percentile range, linearly interpolated.
- **Overshoot** is the paused position once the pause is confirmed, minus the target end. A negative value means the clip was cut short.
- **Pass** means IQR ≤ 150 ms and maximum overshoot ≤ 100 ms.

| Flow | Clip | Runs | Fail | Latency median | Latency IQR | Latency min–max | Overshoot median | Overshoot min–max | \|Overshoot\| > 100 ms | A5 |
|---|---|---|---|---|---|---|---|---|---|---|
| cold | 500 | 6 | 0 | 550 | 73 | 305–703 | −12 | −200 – 26 | 1 | PASS |
| cold | 1000 | 9 | 0 | 560 | 60 | 264–819 | 13 | −202 – 46 | 2 | PASS |
| cold | 2000 | 10 | 0 | 518 | 148 | 388–781 | 217 | 17 – 233 | 7 | FAIL |
| preSeek | 500 | 17 | 0 | 19 | 1 | 17–20 | 10 | −22 – 210 | 3 | FAIL |
| preSeek | 1000 | 11 | 0 | 18 | 1 | 18–19 | 34 | −16 – 269 | 3 | FAIL |
| preSeek | 2000 | 10 | 0 | 19 | 1 | 18–21 | 24 | −11 – 216 | 1 | FAIL |
| preloaded | 500 | 6 | 0 | 19 | 0 | 19–20 | 32 | 0 – 184 | 1 | FAIL |
| preloaded | 1000 | 11 | 0 | 19 | 1 | 18–21 | 25 | −17 – 266 | 1 | FAIL |
| preloaded | 2000 | 11 | 0 | 19 | 1 | 18–20 | 40 | −5 – 274 | 3 | FAIL |

All values are in ms. No run overlapped a hidden tab.

**Per clip length against A5:**
- **0.5 s:** only cold passes.
- **1 s:** only cold passes.
- **2 s:** nothing passes.

The two cold passes are misleading, for two reasons:
- A5 checks only the maximum overshoot, so a clip cut short does not count against it. Cold 500 and cold 1000 each have a run cut short by about 200 ms.
- Cold adds about 550 ms before any audio starts.

Measured by absolute overshoot, no cell passes. The cued flows are the better choice on every other measure.

## What the numbers do and do not measure

- **These are SDK-reported positions, not audio.** The cued latency is almost constant at about 19 ms, and the pause confirmation is constant at 17 to 19 ms. That uniformity looks like the time for the SDK command to resolve, not the moment sound starts or stops.
- **The SDK extrapolates the position while playing.** Some cold runs reached the target and then reported a paused position up to 200 ms *before* it. The playing position runs ahead and is corrected on pause.
- **The run stopped at 91 of the planned 180 runs** (6 to 17 per cell, against the planned 20). The cued cells are very consistent, so more runs are unlikely to change the conclusions. The cold cells are thin.
- **Overshoot is measured differently from R6.** R6 defined it as the position when the pause call returned. The final code uses the paused position once the pause is confirmed, because the earlier reading did not prove that anything had stopped.

## Playback rules the game must follow

These came from failures in earlier runs, described in the next section. They are what the cued numbers above depend on.

1. **Cue before revealing.** The sequence is: `PUT /me/player/play` with `position_ms`, then wait until the state reports *this track playing* past the start point, then pause, then wait for the paused state. A pause sent before the track has loaded is silently dropped.
2. **Pause and seek through the Web API when the SDK does not take effect.**
   - The SDK `pause()` sent right after a Web API play was never honoured: 66 of 66 primed pauses needed `PUT /me/player/pause`.
   - The SDK `seek()` on a freshly primed track was ignored in 13 of 38 preSeek runs and needed `PUT /me/player/seek`.
   - The SDK pause at clip end worked in 91 of 91 runs.
   - The rule: try the SDK call, wait up to 1.5 s for the state to confirm it, then fall back to the Web API.
3. **Confirm commands from the player state, not from the promise.** SDK calls resolve whether or not they take effect.
4. **Match tracks by `uri` or `track_window.current_track.linked_from.uri`.** Spotify relinks some tracks at playback time, for example DICE `1QpwvWMQ…` → `5aaE27JU…` and Mr. Crowley `5XfWzGa5…` → `2ov8L95Q…`. This happens even though the playlist items reported `linked_from` on 0 of 912 items.
5. **Ignore state that belongs to another track.** Right after a track switch, `getCurrentState()` still describes the previous track. Accepting that state produced bogus overshoots of up to 172 s in run 1.
6. **Scopes must include `user-read-email`.** Without it the SDK refuses the token with "Invalid token scopes", even when `streaming` and `user-read-private` are granted. R1 and [`src/auth.ts`](../src/auth.ts) now include it.
7. **Recover from a lost device.** In run 1 the SDK device disappeared mid-session, and every later `PUT /me/player/play` returned 404. Reconnect (a new `Spotify.Player`) and retry.

## How we got here

These earlier runs are not in the repo; the JSON files are local downloads.

| Run | Browser | Runs | Failed | What it showed |
|---|---|---|---|---|
| 2026-10-21 16:08 | Firefox 157 | 180 | 99 | preSeek failed 59/60 with "The operation is not allowed". Device lost at run 139, then 41 runs returned 404. Stale cross-track positions. Preloaded 0–1 ms latencies were the track still playing. All numbers invalid. |
| 2026-10-21 16:18 | Chrome 155 | 21 | 16 | Fixed track matching. Exposed the dropped early pause: "timeout waiting for primed pause". |
| 2026-10-21 16:21 | Chrome 155 | 16 | 12 | Diagnostics showed relinked URIs and an SDK pause never confirmed. |
| 2026-10-22 11:51 | Chrome 155 | 16 | 3 | Web API pause fallback worked. The SDK seek was ignored in 3 of 5 preSeek runs. |
| 2026-10-22 12:00 | Chrome 155 | 91 | 0 | Final; the tables above. |

## Playlist API assumptions

This was checked against one owned playlist of 912 items: `GET /playlists/{id}/items?market=from_token&limit=100`, across 10 pages.

- **Item shape:** each entry holds its object under **`items[].item`** (912/912). The old `items[].track` key never appears (0/912).
- **Playability:** `item.is_playable` is present on 912/912 items with `market=from_token`. One item is `false`.
- **ISRC:** `item.external_ids.isrc` is present on 912/912 items.
- **Duration:** `item.duration_ms` is present on 912/912 items.
- **Relinking:** `item.linked_from` appears on 0/912 items, but playback relinks anyway (rule 4).
- **Item types:** all 912 are `track`. There are no local files and no episodes.

The playlist check flags `items.track` as a missing core field. That warning is a false alarm: the check requires both shapes when it should require one or the other.

**Not verified:** this is the user's own playlist, not the edge-case playlist from the spec. So none of these were exercised:
- the refusal for a followed-but-not-owned playlist
- local files and podcast episodes
- region-locked tracks
- collaborative playlists

## Open follow-ups

- **Revise A5** for the game, for example: median |overshoot| ≤ 50 ms and no run beyond 300 ms. All cued cells meet that bar; the cold cells do not.
- **Tighten clip ends** if playtests find the overshoot tail unfair. One option is to issue the pause slightly before the target, using the measured median.
- **Extract the `PlaybackAdapter` interface** (spike task T9) from [`src/sdkPlayer.ts`](../src/sdkPlayer.ts) and the cue sequence in [`src/flows.ts`](../src/flows.ts).
- **Test Safari and mobile** (A9). They are untested; the game is desktop Chrome only until then.
- **Run the edge-case playlist** through the playlist check before building track selection.
