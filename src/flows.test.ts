import { describe, expect, it } from 'vitest';
import { runBatch, runTrial, type Clock, type TrialDeps } from './flows';
import type { PlanEntry, TrialTrack } from './runPlan';

const track: TrialTrack = { uri: 'spotify:track:a', id: 'a', name: 'A', durationMs: 200_000, startMs: 30_000 };

/** Virtual-time player: audio starts `latencyMs` after play/resume, position then advances 1:1. */
function fake(opts: { latencyMs: number; pauseLagMs?: number; failPlay?: boolean; stall?: boolean }) {
  let t = 0;
  const clock: Clock = {
    now: () => t,
    sleep: async (ms) => void (t += ms),
  };
  let pos = 999_999; // stale position left by a previous clip
  let playingSince: number | null = null;
  let anchor = 0;
  const position = () => (playingSince !== null && t >= playingSince && !opts.stall ? anchor + (t - playingSince) : pos);
  const player: TrialDeps['player'] = {
    async playFrom(_u, ms) {
      if (opts.failPlay) throw new Error('PUT /me/player/play → 404');
      t += 5;
      anchor = ms;
      pos = ms;
      playingSince = t + opts.latencyMs;
    },
    async pause() {
      t += opts.pauseLagMs ?? 0;
      pos = position();
      anchor = pos;
      playingSince = null;
    },
    async resume() {
      t += 5;
      playingSince = t + opts.latencyMs;
    },
    async seek(ms) {
      anchor = ms;
      pos = ms;
      playingSince = null;
    },
    async getPositionMs() {
      return position();
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
