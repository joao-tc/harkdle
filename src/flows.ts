import type { ClipLengthMs, Flow, PlanEntry, TrialTrack } from './runPlan';
import type { SdkPlayer } from './sdkPlayer';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface TrialDeps {
  player: Pick<SdkPlayer, 'playFrom' | 'pause' | 'resume' | 'seek' | 'getPositionMs'>;
  clock: Clock;
  /** true if the tab was hidden at any point since `sinceMs` (clock time) */
  wasHiddenSince(sinceMs: number): boolean;
  /** returns and clears the last SDK error, if any */
  takeError(): string | null;
  pollMs?: number;
  timeoutMs?: number;
  /** simulated reveal delay for the preloaded flow */
  revealDelayMs?: number;
}

export interface RunResult {
  flow: Flow;
  clipLengthMs: ClipLengthMs;
  trackUri: string;
  startMs: number;
  resumeToFirstPositionMs?: number;
  /** position when the pause call returned minus the target end; negative = ended early */
  endOvershootMs?: number;
  failed: boolean;
  reason?: string;
  hiddenDuringRun: boolean;
}

const POLL_MS = 15;
const TIMEOUT_MS = 5000;
const REVEAL_DELAY_MS = 2000;

class TrialError extends Error {}

async function waitFor(deps: TrialDeps, what: string, test: (pos: number) => boolean): Promise<{ pos: number; at: number }> {
  const start = deps.clock.now();
  const timeout = deps.timeoutMs ?? TIMEOUT_MS;
  for (;;) {
    const err = deps.takeError();
    if (err) throw new TrialError(err);
    const pos = await deps.player.getPositionMs();
    const at = deps.clock.now();
    if (test(pos)) return { pos, at };
    if (at - start > timeout) throw new TrialError(`timeout waiting for ${what}`);
    await deps.clock.sleep(deps.pollMs ?? POLL_MS);
  }
}

/** Loads the track at its start point and leaves it paused there. Not timed. */
async function prime(deps: TrialDeps, track: TrialTrack): Promise<void> {
  await deps.player.playFrom(track.uri, track.startMs);
  await deps.player.pause();
  // Settled once the reported position sits at (or just past) the start point.
  await waitFor(deps, 'primed position', (p) => p >= track.startMs && p < track.startMs + 1000);
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
  try {
    let tResume: number;
    let baseline: number;
    if (entry.flow === 'cold') {
      baseline = await deps.player.getPositionMs();
      tResume = deps.clock.now();
      await deps.player.playFrom(track.uri, track.startMs);
    } else {
      await prime(deps, track);
      if (entry.flow === 'preSeek') {
        await deps.player.seek(track.startMs);
        baseline = await deps.player.getPositionMs();
      } else {
        await deps.clock.sleep(deps.revealDelayMs ?? REVEAL_DELAY_MS);
        baseline = await deps.player.getPositionMs();
      }
      tResume = deps.clock.now();
      await deps.player.resume();
    }

    // Moving = strictly past the start point and different from what was reported before the call
    // (the baseline guard rejects a stale position left over from the previous clip).
    const first = await waitFor(deps, 'first position change', (p) => p > track.startMs && p !== baseline);
    const resumeToFirstPositionMs = first.at - tResume;

    const target = track.startMs + entry.clipLengthMs;
    await waitFor(deps, 'clip end', (p) => p >= target);
    await deps.player.pause();
    const endPos = await deps.player.getPositionMs();

    return {
      ...base,
      resumeToFirstPositionMs,
      endOvershootMs: endPos - target,
      hiddenDuringRun: deps.wasHiddenSince(t0),
    };
  } catch (e) {
    try {
      await deps.player.pause();
    } catch {
      // best effort: the next run re-primes anyway
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
  for (const entry of plan) {
    if (shouldStop()) break;
    const track = tracks[entry.trackIndex % tracks.length]!;
    const r = await runTrial(entry, track, deps);
    results.push(r);
    onResult(r, results.length, plan.length);
  }
  return results;
}
