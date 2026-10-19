import type { ItemInfo } from './playlistCheck';
import type { Rng, TrialTrack } from './runPlan';

const MIN_FRACTION = 0.1;
const MAX_FRACTION = 0.7;
/** room after the start point: longest clip (2s) plus a margin for latency and overshoot */
const TAIL_NEEDED_MS = 2000 + 1500;

export interface TrialSet {
  tracks: TrialTrack[];
  requested: number;
  shortfall: number;
}

export function isPlayableTrack(i: ItemInfo): boolean {
  return i.type === 'track' && !i.isLocal && i.isPlayable !== false && i.uri !== null && i.id !== null && i.durationMs !== null;
}

export function startPointFor(durationMs: number, rng: Rng): number {
  const lo = durationMs * MIN_FRACTION;
  const hi = Math.min(durationMs * MAX_FRACTION, durationMs - TAIL_NEEDED_MS);
  // very short tracks: fall back to the earliest point that still fits the clip
  if (hi <= lo) return Math.max(0, Math.floor(durationMs - TAIL_NEEDED_MS));
  return Math.floor(lo + rng() * (hi - lo));
}

export function pickTrialSet(items: ItemInfo[], rng: Rng, n = 20): TrialSet {
  // one per ISRC (or per id when there is no ISRC), in playlist order
  const seen = new Set<string>();
  const pool = items.filter(isPlayableTrack).filter((i) => {
    const key = i.isrc ?? `id:${i.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const byDuration = [...pool].sort((a, b) => a.durationMs! - b.durationMs!);
  let chosen: ItemInfo[];
  if (byDuration.length <= n) {
    chosen = byDuration;
  } else {
    // evenly spaced ranks, always including the shortest and the longest
    chosen = Array.from({ length: n }, (_, k) => byDuration[Math.round((k * (byDuration.length - 1)) / (n - 1))]!);
  }

  const tracks: TrialTrack[] = chosen.map((i) => ({
    uri: i.uri!,
    id: i.id!,
    name: i.name ?? i.id!,
    durationMs: i.durationMs!,
    startMs: startPointFor(i.durationMs!, rng),
  }));
  return { tracks, requested: n, shortfall: Math.max(0, n - tracks.length) };
}
