import { describe, expect, it } from 'vitest';
import { CLIP_LENGTHS, FLOWS, makeRunPlan, seededRng } from './runPlan';

describe('makeRunPlan', () => {
  it('has exactly 20 runs for each of the 9 cells', () => {
    const plan = makeRunPlan(20, FLOWS, CLIP_LENGTHS, 20, seededRng(1));
    expect(plan).toHaveLength(180);
    const counts = new Map<string, number>();
    for (const p of plan) counts.set(`${p.flow}/${p.clipLengthMs}`, (counts.get(`${p.flow}/${p.clipLengthMs}`) ?? 0) + 1);
    expect(counts.size).toBe(9);
    expect([...counts.values()].every((c) => c === 20)).toBe(true);
  });
  it('is deterministic for a fixed seed and differs across seeds', () => {
    const a = makeRunPlan(20, FLOWS, CLIP_LENGTHS, 20, seededRng(42));
    const b = makeRunPlan(20, FLOWS, CLIP_LENGTHS, 20, seededRng(42));
    const c = makeRunPlan(20, FLOWS, CLIP_LENGTHS, 20, seededRng(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('interleaves flows rather than running them in blocks', () => {
    const plan = makeRunPlan(20, FLOWS, CLIP_LENGTHS, 20, seededRng(7));
    expect(new Set(plan.slice(0, 20).map((p) => p.flow)).size).toBeGreaterThan(1);
  });
  it('covers every track in each cell when runsPerCell equals the track count', () => {
    const plan = makeRunPlan(20, ['cold'], [500], 20, seededRng(3));
    expect(new Set(plan.map((p) => p.trackIndex)).size).toBe(20);
  });
});
