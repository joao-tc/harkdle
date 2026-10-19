export type Flow = 'cold' | 'preSeek' | 'preloaded';
export type ClipLengthMs = 500 | 1000 | 2000;

export const FLOWS: Flow[] = ['cold', 'preSeek', 'preloaded'];
export const CLIP_LENGTHS: ClipLengthMs[] = [500, 1000, 2000];

export type Rng = () => number;

export interface PlanEntry {
  flow: Flow;
  clipLengthMs: ClipLengthMs;
  /** index into the trial set; each cell cycles through it */
  trackIndex: number;
}

/** mulberry32: small seeded PRNG, returns [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** runsPerCell entries for every flow × clip length, shuffled so drift isn't confounded with a flow. */
export function makeRunPlan(
  trackCount: number,
  flows: Flow[],
  clipLengths: ClipLengthMs[],
  runsPerCell: number,
  rng: Rng,
): PlanEntry[] {
  const plan: PlanEntry[] = [];
  for (const flow of flows) {
    for (const clipLengthMs of clipLengths) {
      for (let i = 0; i < runsPerCell; i++) {
        plan.push({ flow, clipLengthMs, trackIndex: i % trackCount });
      }
    }
  }
  return shuffle(plan, rng);
}

export interface TrialTrack {
  uri: string;
  id: string;
  name: string;
  durationMs: number;
  /** where the clip starts */
  startMs: number;
}
