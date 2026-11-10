# ADR-0003 — Cues run with the SDK volume at 0 and restore the player's volume afterwards

**Status:** Accepted
**Date:** 2026-11-10

## Context

[ADR-0001](0001-stack-and-playback.md) makes every clip start from a *cued* track: `PUT /me/player/play` at the start point, wait until the track is playing, pause, wait for the paused state, seek back. The spike measured this for latency and overshoot, not for sound. While the track plays before the pause lands, the player hears it. That is about 0.5 s or more of audio from the start point, which is the same audio as step 1 of the clip in Classic start. It happens during the 3-2-1 countdown between rounds and again on every reroll, so the cue would hand out part of the answer for free.

The SDK can set the volume (`setVolume`), but whether it takes effect fast enough, restores cleanly and leaves the cue timing alone has not been tested (the roadmap's "needs verification" list).

## Decision

The playback adapter sets the SDK volume to 0 before the Web API play and restores the player's own volume once the paused, seeked state is confirmed. The restore runs on every exit path, including a failed cue. The adapter remembers the user's volume (from `connect` and `setVolume`), so the restore never returns a stale default, and a `setVolume` during a cue takes effect at the restore.

This is confirmed live before the playback-adapter item is done (spec V1). If muting turns out not to work or to disturb the cue timing, this ADR is superseded by one that records the fallback.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Accept the leak and let the countdown mask it | The countdown does not mask it: the leaked audio is the start of clip 1 and plays during the countdown. Random-start rounds and rerolls leak their start point too. |
| Cue by another route (for example transfer playback paused, or `play: false`) | The Web API cannot load a track at a position without starting it, and the SDK has no load-without-play call. The spike found no such path. |
| Leave the volume at 0 and fade in at the clip | It adds a second volume change on the latency-critical resume, and a missed restore would leave the game silent. |

## Consequences

**Good**
- No part of the answer is audible before the player presses Play.
- One extra `setVolume` pair per cue, outside the timed resume path.

**Bad**
- A failure between the mute and the restore would leave the player silent. The restore is in `finally`, and a fresh `connect` always starts at the caller's volume.
- Depends on the SDK honouring `setVolume` immediately, which is unverified until the live check.

**Follow-ups**
- Live check V1 (mute, restore, timing). Supersede this ADR if it fails.
