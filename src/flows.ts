import type { ClipLengthMs, Flow, PlanEntry, TrialTrack } from './runPlan';
import type { PlayerState, SdkPlayer } from './sdkPlayer';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface TrialDeps {
  player: Pick<SdkPlayer, 'playFrom' | 'pause' | 'pauseViaApi' | 'resume' | 'seek' | 'seekViaApi' | 'getState'>;
  clock: Clock;
  /** true if the tab was hidden at any point since `sinceMs` (clock time) */
  wasHiddenSince(sinceMs: number): boolean;
  /** returns and clears the last SDK error, if any */
  takeError(): string | null;
  pollMs?: number;
  timeoutMs?: number;
  /** simulated reveal delay for the preloaded flow */
  revealDelayMs?: number;
  /** called by runBatch when a run died because the device vanished (404); the run is then retried once */
  recover?(): Promise<void>;
  /** runBatch gives up after this many failed runs in a row */
  maxConsecutiveFailures?: number;
}

export interface RunResult {
  flow: Flow;
  clipLengthMs: ClipLengthMs;
  trackUri: string;
  startMs: number;
  resumeToFirstPositionMs?: number;
  /** paused position once the pause was confirmed, minus the target end (resume position + clip length); negative = ended early */
  endOvershootMs?: number;
  /** pause call → state reports paused, at clip end */
  endPauseConfirmMs?: number;
  /** which call actually paused: the SDK's pause(), or the Web API fallback after the SDK one was not confirmed */
  endPauseVia?: PauseVia;
  primePauseVia?: PauseVia;
  /** preSeek only: which call moved the paused player back to the start point */
  seekVia?: PauseVia;
  failed: boolean;
  reason?: string;
  hiddenDuringRun: boolean;
}

const POLL_MS = 15;
const TIMEOUT_MS = 5000;
const REVEAL_DELAY_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 8;
const SEEK_TOLERANCE_MS = 50;
/** how long an SDK pause() or seek() gets to show up in the state before falling back to the Web API */
const SDK_PAUSE_GRACE_MS = 1500;

export type PauseVia = 'sdk' | 'webApi';

class TrialError extends Error {}

/** Whether `s` describes `uri`; right after a track switch the SDK still reports the previous track. */
function isTrack(s: PlayerState, uri: string): boolean {
  return s.uri === uri || s.linkedFromUri === uri;
}

async function stateOf(deps: TrialDeps, uri: string): Promise<PlayerState | null> {
  const s = await deps.player.getState();
  return s && isTrack(s, uri) ? s : null;
}

class TimeoutError extends TrialError {}

async function waitFor(
  deps: TrialDeps,
  uri: string,
  what: string,
  test: (s: PlayerState) => boolean,
  timeout = deps.timeoutMs ?? TIMEOUT_MS,
): Promise<{ state: PlayerState; at: number }> {
  const start = deps.clock.now();
  for (;;) {
    const err = deps.takeError();
    if (err) throw new TrialError(err);
    const raw = await deps.player.getState();
    const state = raw && isTrack(raw, uri) ? raw : null;
    const at = deps.clock.now();
    if (state && test(state)) return { state, at };
    if (at - start > timeout) {
      const seen = raw ? `${isTrack(raw, uri) ? 'this track' : raw.uri}, ${raw.paused ? 'paused' : 'playing'}, ${Math.round(raw.positionMs)}ms` : 'no state';
      throw new TimeoutError(`timeout waiting for ${what} (last state: ${seen})`);
    }
    await deps.clock.sleep(deps.pollMs ?? POLL_MS);
  }
}

/** Pauses with the SDK; if the state does not show paused within the grace period, pauses through the Web API. */
async function pauseConfirmed(deps: TrialDeps, uri: string, what: string): Promise<{ state: PlayerState; via: PauseVia; confirmMs: number }> {
  const t = deps.clock.now();
  await deps.player.pause();
  try {
    const { state, at } = await waitFor(deps, uri, what, (s) => s.paused, SDK_PAUSE_GRACE_MS);
    return { state, via: 'sdk', confirmMs: at - t };
  } catch (e) {
    if (!(e instanceof TimeoutError)) throw e;
  }
  await deps.player.pauseViaApi();
  const { state, at } = await waitFor(deps, uri, `${what} (Web API fallback)`, (s) => s.paused);
  return { state, via: 'webApi', confirmMs: at - t };
}

/** Seeks the paused player with the SDK; if the state does not show the new position within the grace period, seeks through the Web API. */
async function seekConfirmed(deps: TrialDeps, uri: string, ms: number): Promise<{ state: PlayerState; via: PauseVia }> {
  const atTarget = (s: PlayerState) => s.paused && Math.abs(s.positionMs - ms) <= SEEK_TOLERANCE_MS;
  await deps.player.seek(ms);
  try {
    return { state: (await waitFor(deps, uri, 'seek to start', atTarget, SDK_PAUSE_GRACE_MS)).state, via: 'sdk' };
  } catch (e) {
    if (!(e instanceof TimeoutError)) throw e;
  }
  await deps.player.seekViaApi(ms);
  return { state: (await waitFor(deps, uri, 'seek to start (Web API fallback)', atTarget)).state, via: 'webApi' };
}

/**
 * Loads the track at its start point and leaves it paused. Not timed.
 * Returns the paused position: pause() can land after playback began, so it may sit past startMs.
 */
async function prime(deps: TrialDeps, track: TrialTrack): Promise<{ positionMs: number; via: PauseVia }> {
  await deps.player.playFrom(track.uri, track.startMs);
  // A pause sent before the track has loaded is lost and playback carries on, so only pause once it is really playing.
  await waitFor(deps, track.uri, 'priming playback', (s) => !s.paused && s.positionMs > track.startMs);
  const { state, via } = await pauseConfirmed(deps, track.uri, 'primed pause');
  return { positionMs: state.positionMs, via };
}

export async function runTrial(entry: PlanEntry, track: TrialTrack, deps: TrialDeps): Promise<RunResult> {
  const base: RunResult = {
    flow: entry.flow,
    clipLengthMs: entry.clipLengthMs,
    trackUri: track.uri,
    startMs: track.startMs,
    failed: false,
    hiddenDuringRun: false,
  };
  const t0 = deps.clock.now();
  deps.takeError(); // an error left over from the previous run must not fail this one
  try {
    let tResume: number;
    // Position the clip counts from: the start point for cold, where the primed player actually sits otherwise.
    let origin: number;
    // Position reported before the call; the "moving" check must see something different.
    let baseline = -1;
    let primePauseVia: PauseVia | undefined;
    let seekVia: PauseVia | undefined;
    if (entry.flow === 'cold') {
      origin = track.startMs;
      baseline = (await stateOf(deps, track.uri))?.positionMs ?? -1;
      tResume = deps.clock.now();
      await deps.player.playFrom(track.uri, track.startMs);
    } else {
      const primed = await prime(deps, track);
      origin = primed.positionMs;
      primePauseVia = primed.via;
      if (entry.flow === 'preSeek') {
        const sought = await seekConfirmed(deps, track.uri, track.startMs);
        origin = sought.state.positionMs;
        seekVia = sought.via;
      } else {
        await deps.clock.sleep(deps.revealDelayMs ?? REVEAL_DELAY_MS);
        origin = (await waitFor(deps, track.uri, 'paused position', (s) => s.paused)).state.positionMs;
      }
      baseline = origin;
      tResume = deps.clock.now();
      await deps.player.resume();
    }

    // Moving = actually playing, past where the clip counts from, and different from what was reported before the call
    // (the baseline guard rejects a stale position left over from the previous clip of the same track).
    const first = await waitFor(deps, track.uri, 'first position change', (s) => !s.paused && s.positionMs > origin && s.positionMs !== baseline);
    const resumeToFirstPositionMs = first.at - tResume;

    const target = origin + entry.clipLengthMs;
    await waitFor(deps, track.uri, 'clip end', (s) => s.positionMs >= target);
    const end = await pauseConfirmed(deps, track.uri, 'clip-end pause');

    return {
      ...base,
      resumeToFirstPositionMs,
      endOvershootMs: end.state.positionMs - target,
      endPauseConfirmMs: end.confirmMs,
      endPauseVia: end.via,
      primePauseVia,
      seekVia,
      hiddenDuringRun: deps.wasHiddenSince(t0),
    };
  } catch (e) {
    try {
      // best effort, through the Web API too since the SDK pause is not always honoured: the next run re-primes anyway
      await deps.player.pause();
      await deps.player.pauseViaApi();
    } catch {
      // ignore
    }
    return {
      ...base,
      failed: true,
      reason: e instanceof Error ? e.message : String(e),
      hiddenDuringRun: deps.wasHiddenSince(t0),
    };
  }
}

export async function runBatch(
  plan: PlanEntry[],
  tracks: TrialTrack[],
  deps: TrialDeps,
  onResult: (r: RunResult, done: number, total: number) => void,
  shouldStop: () => boolean = () => false,
): Promise<RunResult[]> {
  const results: RunResult[] = [];
  const maxFailures = deps.maxConsecutiveFailures ?? MAX_CONSECUTIVE_FAILURES;
  let streak = 0;
  for (const entry of plan) {
    if (shouldStop()) break;
    const track = tracks[entry.trackIndex % tracks.length]!;
    let r = await runTrial(entry, track, deps);
    if (r.failed && deps.recover && r.reason?.includes('→ 404')) {
      // The device is gone, so this run measured nothing: reconnect and run it again.
      try {
        await deps.recover();
      } catch {
        results.push(r);
        onResult(r, results.length, plan.length);
        break;
      }
      r = await runTrial(entry, track, deps);
    }
    results.push(r);
    onResult(r, results.length, plan.length);
    streak = r.failed ? streak + 1 : 0;
    if (streak >= maxFailures) break;
  }
  return results;
}
