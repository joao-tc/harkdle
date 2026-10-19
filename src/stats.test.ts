import { describe, expect, it } from 'vitest';
import { evaluateCell, summarize } from './stats';

describe('summarize', () => {
  it('returns null for an empty set', () => {
    expect(summarize([])).toBeNull();
  });
  it('handles a single sample', () => {
    expect(summarize([7])).toEqual({ n: 1, median: 7, iqr: 0, min: 7, max: 7 });
  });
  it('handles an odd count', () => {
    expect(summarize([5, 1, 3, 2, 4])).toEqual({ n: 5, median: 3, iqr: 2, min: 1, max: 5 });
  });
  it('handles an even count', () => {
    expect(summarize([4, 1, 3, 2])).toEqual({ n: 4, median: 2.5, iqr: 1.5, min: 1, max: 4 });
  });
});

describe('evaluateCell', () => {
  const ok = (l: number, o: number) => ({ failed: false, resumeToFirstPositionMs: l, endOvershootMs: o });

  it('passes when IQR and overshoot are within the bar', () => {
    const r = evaluateCell([ok(300, 20), ok(350, 40), ok(400, 90)]);
    expect(r.pass).toBe(true);
  });
  it('fails on wide latency spread', () => {
    expect(evaluateCell([ok(100, 10), ok(500, 10), ok(900, 10)]).pass).toBe(false);
  });
  it('fails on overshoot above 100ms', () => {
    expect(evaluateCell([ok(300, 10), ok(300, 101)]).pass).toBe(false);
  });
  it('counts failures separately and ignores them in the stats', () => {
    const r = evaluateCell([ok(300, 10), { failed: true }]);
    expect(r.failures).toBe(1);
    expect(r.latency?.n).toBe(1);
  });
  it('does not pass with no successful runs', () => {
    expect(evaluateCell([{ failed: true }]).pass).toBe(false);
  });
});
