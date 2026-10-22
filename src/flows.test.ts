import { describe, expect, it } from 'vitest';
import { runBatch, runTrial, type Clock, type TrialDeps } from './flows';
import type { PlanEntry, TrialTrack } from './runPlan';

const track: TrialTrack = { uri: 'spotify:track:a', id: 'a', name: 'A', durationMs: 200_000, startMs: 30_000 };

/**
 * Virtual-time player: audio starts `latencyMs` after play/resume, position then advances 1:1.
 * Until the new track's audio starts, getState() still reports the previous track (at a stale position).
 */
function fake(opts: {
  latencyMs: number;
  pauseLagMs?: number;
  firstPauseLagMs?: number;
  failPlay?: boolean;
  stall?: boolean;
  /** SDK reports this URI instead of the requested one (market relinking) */
  relinkedTo?: string;
  /** SDK pause() resolves but does nothing; only the Web API pause works */
  sdkPauseIgnored?: boolean;
  /** same for seek() */
  sdkSeekIgnored?: boolean;
}) {
  let t = 0;
  const clock: Clock = {
    now: () => t,
    sleep: async (ms) => void (t += ms),
  };
  let pos = 999_999; // stale position left by a previous clip
  let uri = 'spotify:track:previous';
  let pendingUri: string | null = null;
  let paused = true;
  let playingSince: number | null = null;
  let anchor = 0;
  let pauses = 0;
  const position = () => (playingSince !== null && t >= playingSince && !opts.stall ? anchor + (t - playingSince) : pos);
  const player: TrialDeps['player'] = {
    async playFrom(u, ms) {
      if (opts.failPlay) throw new Error('PUT /me/player/play → 404');
      t += 5;
      anchor = ms;
      pos = ms;
      paused = false;
      pendingUri = u;
      playingSince = t + opts.latencyMs;
    },
    async pause() {
      if (!opts.sdkPauseIgnored) await this.pauseViaApi();
    },
    async pauseViaApi() {
      t += pauses++ === 0 ? (opts.firstPauseLagMs ?? opts.pauseLagMs ?? 0) : (opts.pauseLagMs ?? 0);
      pos = position();
      anchor = pos;
      playingSince = null;
      paused = true;
      if (pendingUri) uri = pendingUri;
    },
    async resume() {
      t += 5;
      paused = false;
      playingSince = t + opts.latencyMs;
    },
    async seek(ms) {
      if (!opts.sdkSeekIgnored) await this.seekViaApi(ms);
    },
    async seekViaApi(ms) {
      anchor = ms;
      pos = ms;
      playingSince = null;
      paused = true;
    },
    async getState() {
      if (pendingUri && playingSince !== null && t >= playingSince) uri = pendingUri;
      const relinked = opts.relinkedTo && uri !== 'spotify:track:previous';
      return { positionMs: position(), paused, uri: relinked ? opts.relinkedTo! : uri, linkedFromUri: relinked ? uri : null };
    },
  };
  return { clock, player, now: () => t };
}

const deps = (f: ReturnType<typeof fake>, extra: Partial<TrialDeps> = {}): TrialDeps => ({
  player: f.player,
  clock: f.clock,
  wasHiddenSince: () => false,
  takeError: () => null,
  pollMs: 10,
  ...extra,
});
const entry = (flow: PlanEntry['flow'], clipLengthMs: PlanEntry['clipLengthMs'] = 1000): PlanEntry => ({ flow, clipLengthMs, trackIndex: 0 });

describe('runTrial', () => {
  it.each(['cold', 'preSeek', 'preloaded'] as const)('%s measures latency and overshoot', async (flow) => {
    const f = fake({ latencyMs: 300, pauseLagMs: 40 });
    const r = await runTrial(entry(flow), track, deps(f));
    expect(r.failed).toBe(false);
    // 5ms call + 300ms latency, observed on a 10ms poll grid
    expect(r.resumeToFirstPositionMs).toBeGreaterThanOrEqual(300);
    expect(r.resumeToFirstPositionMs).toBeLessThan(330);
    // polling quantum (<=10ms) plus the 40ms pause lag
    expect(r.endOvershootMs).toBeGreaterThanOrEqual(40);
    expect(r.endOvershootMs).toBeLessThanOrEqual(60);
  });

  it('does not mistake the stale previous position for movement in the cold flow', async () => {
    const f = fake({ latencyMs: 500 });
    const r = await runTrial(entry('cold'), track, deps(f));
    expect(r.resumeToFirstPositionMs).toBeGreaterThanOrEqual(500);
  });

  it('does not count a pause that landed late as part of the clip in the cued flows', async () => {
    // playback is already running when the priming pause() lands, so a cued preloaded track sits 700ms past the start point
    const f = fake({ latencyMs: 0, firstPauseLagMs: 700 });
    const r = await runTrial(entry('preloaded', 500), track, deps(f));
    expect(r.failed).toBe(false);
    expect(r.endOvershootMs).toBeGreaterThanOrEqual(0);
    expect(r.endOvershootMs).toBeLessThan(30);
  });

  it('seeks a late-paused track back to the start point in the preSeek flow', async () => {
    const f = fake({ latencyMs: 0, firstPauseLagMs: 700 });
    const r = await runTrial(entry('preSeek', 500), track, deps(f));
    expect(r.failed).toBe(false);
    expect(r.endOvershootMs).toBeLessThan(30);
  });

  it('matches a track that Spotify relinked to another URI', async () => {
    const f = fake({ latencyMs: 100, relinkedTo: 'spotify:track:relinked' });
    const r = await runTrial(entry('preSeek'), track, deps(f));
    expect(r.failed).toBe(false);
  });

  it('falls back to the Web API pause when the SDK pause is not honoured, and says so', async () => {
    const f = fake({ latencyMs: 100, sdkPauseIgnored: true });
    const r = await runTrial(entry('preloaded'), track, deps(f));
    expect(r).toMatchObject({ failed: false, primePauseVia: 'webApi', endPauseVia: 'webApi' });
    expect(r.endPauseConfirmMs).toBeGreaterThanOrEqual(1500);
  });

  it('falls back to the Web API seek when the SDK seek is not honoured', async () => {
    const f = fake({ latencyMs: 100, firstPauseLagMs: 700, sdkSeekIgnored: true });
    const r = await runTrial(entry('preSeek', 500), track, deps(f));
    expect(r).toMatchObject({ failed: false, seekVia: 'webApi' });
    expect(r.endOvershootMs).toBeLessThan(30);
  });

  it('reports the SDK pause when it works', async () => {
    const r = await runTrial(entry('preloaded'), track, deps(fake({ latencyMs: 100 })));
    expect(r).toMatchObject({ primePauseVia: 'sdk', endPauseVia: 'sdk' });
  });

  it('records a timeout as a failed run', async () => {
    const f = fake({ latencyMs: 0, stall: true });
    const r = await runTrial(entry('cold'), track, deps(f));
    expect(r.failed).toBe(true);
    expect(r.reason).toContain('timeout');
  });

  it('records an unplayable track as a failed run', async () => {
    const r = await runTrial(entry('preSeek'), track, deps(fake({ latencyMs: 0, failPlay: true })));
    expect(r).toMatchObject({ failed: true });
    expect(r.reason).toContain('404');
  });

  it('records an SDK error as a failed run', async () => {
    const f = fake({ latencyMs: 100 });
    const r = await runTrial(entry('cold'), track, deps(f, { takeError: () => 'playback_error: boom' }));
    expect(r.failed).toBe(true);
    expect(r.reason).toContain('boom');
  });

  it('flags a run that overlapped a hidden tab without failing it', async () => {
    const f = fake({ latencyMs: 100 });
    const r = await runTrial(entry('cold'), track, deps(f, { wasHiddenSince: () => true }));
    expect(r).toMatchObject({ failed: false, hiddenDuringRun: true });
  });

  it('waits the simulated reveal delay in the preloaded flow without timing it', async () => {
    const f = fake({ latencyMs: 100 });
    const r = await runTrial(entry('preloaded'), track, deps(f, { revealDelayMs: 2000 }));
    expect(f.now()).toBeGreaterThanOrEqual(2000);
    expect(r.resumeToFirstPositionMs).toBeLessThan(200);
  });
});

describe('runBatch', () => {
  it('continues after a failed run', async () => {
    let calls = 0;
    const f = fake({ latencyMs: 50 });
    const flaky: TrialDeps['player'] = {
      ...f.player,
      playFrom: async (u, ms) => {
        if (++calls === 1) throw new Error('boom');
        return f.player.playFrom(u, ms);
      },
    };
    const seen: number[] = [];
    const res = await runBatch([entry('cold'), entry('cold')], [track], deps(f, { player: flaky }), (_r, done) => seen.push(done));
    expect(res.map((r) => r.failed)).toEqual([true, false]);
    expect(seen).toEqual([1, 2]);
  });
});

describe('runBatch resilience', () => {
  it('reconnects and retries a run once when the device is gone (404)', async () => {
    const f = fake({ latencyMs: 50 });
    let calls = 0;
    let recovered = 0;
    const flaky: TrialDeps['player'] = {
      ...f.player,
      playFrom: async (u, ms) => {
        if (++calls === 1) throw new Error('PUT /me/player/play?device_id=x → 404');
        return f.player.playFrom(u, ms);
      },
    };
    const res = await runBatch([entry('cold')], [track], deps(f, { player: flaky, recover: async () => void recovered++ }), () => undefined);
    expect(recovered).toBe(1);
    expect(res).toHaveLength(1);
    expect(res[0]!.failed).toBe(false);
  });

  it('stops when recovery itself fails', async () => {
    const f = fake({ latencyMs: 0, failPlay: true });
    const res = await runBatch([entry('cold'), entry('cold')], [track], deps(f, { recover: async () => Promise.reject(new Error('no')) }), () => undefined);
    expect(res).toHaveLength(1);
    expect(res[0]!.failed).toBe(true);
  });

  it('gives up after too many consecutive failures', async () => {
    const f = fake({ latencyMs: 0, stall: true });
    const plan = Array.from({ length: 10 }, () => entry('cold'));
    const res = await runBatch(plan, [track], deps(f, { maxConsecutiveFailures: 3, timeoutMs: 50 }), () => undefined);
    expect(res).toHaveLength(3);
  });
});
