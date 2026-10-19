export interface Summary {
  n: number;
  median: number;
  iqr: number;
  min: number;
  max: number;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

/** Returns null for an empty set. IQR uses linear interpolation (type 7). */
export function summarize(values: number[]): Summary | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    median: quantile(s, 0.5),
    iqr: quantile(s, 0.75) - quantile(s, 0.25),
    min: s[0]!,
    max: s[s.length - 1]!,
  };
}

export interface RunMetrics {
  failed: boolean;
  resumeToFirstPositionMs?: number;
  endOvershootMs?: number;
}

export const MAX_IQR_MS = 150;
export const MAX_OVERSHOOT_MS = 100;

export interface CellEvaluation {
  runs: number;
  failures: number;
  latency: Summary | null;
  overshoot: Summary | null;
  pass: boolean;
}

/** A5: IQR of resume→first-position ≤150ms and max overshoot ≤100ms. Failed runs are counted apart. */
export function evaluateCell(runs: RunMetrics[]): CellEvaluation {
  const ok = runs.filter((r) => !r.failed);
  const latency = summarize(ok.flatMap((r) => (r.resumeToFirstPositionMs === undefined ? [] : [r.resumeToFirstPositionMs])));
  const overshoot = summarize(ok.flatMap((r) => (r.endOvershootMs === undefined ? [] : [r.endOvershootMs])));
  const pass =
    latency !== null &&
    overshoot !== null &&
    latency.iqr <= MAX_IQR_MS &&
    overshoot.max <= MAX_OVERSHOOT_MS;
  return { runs: runs.length, failures: runs.length - ok.length, latency, overshoot, pass };
}
