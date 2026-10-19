import { describe, expect, it } from 'vitest';
import type { ItemInfo } from './playlistCheck';
import { seededRng } from './runPlan';
import { pickTrialSet, startPointFor } from './trialSet';

const item = (n: number, over: Partial<ItemInfo> = {}): ItemInfo => ({
  shape: 'item', type: 'track', uri: `spotify:track:${n}`, id: `${n}`, name: `T${n}`,
  isPlayable: true, hasLinkedFrom: false, isLocal: false, isrc: `ISRC${n}`, durationMs: 60_000 + n * 10_000, ...over,
});

describe('pickTrialSet', () => {
  it('returns what exists and reports the shortfall when under 20', () => {
    const s = pickTrialSet([item(1), item(2), item(3)], seededRng(1));
    expect(s.tracks).toHaveLength(3);
    expect(s.shortfall).toBe(17);
  });

  it('excludes episodes, local files and unplayable items', () => {
    const s = pickTrialSet([item(1), item(2, { type: 'episode' }), item(3, { isLocal: true }), item(4, { isPlayable: false })], seededRng(1));
    expect(s.tracks.map((t) => t.id)).toEqual(['1']);
  });

  it('keeps one track per ISRC', () => {
    const s = pickTrialSet([item(1), item(2, { isrc: 'ISRC1' }), item(3)], seededRng(1));
    expect(s.tracks).toHaveLength(2);
  });

  it('picks 20 spread by duration including shortest and longest', () => {
    const s = pickTrialSet(Array.from({ length: 120 }, (_, i) => item(i)), seededRng(1));
    expect(s.tracks).toHaveLength(20);
    expect(s.tracks[0]!.id).toBe('0');
    expect(s.tracks[19]!.id).toBe('119');
    expect(s.shortfall).toBe(0);
  });

  it('places start points in 10–70% and is deterministic for a seed', () => {
    const items = Array.from({ length: 40 }, (_, i) => item(i));
    const a = pickTrialSet(items, seededRng(9));
    const b = pickTrialSet(items, seededRng(9));
    expect(a).toEqual(b);
    for (const t of a.tracks) {
      expect(t.startMs).toBeGreaterThanOrEqual(t.durationMs * 0.1 - 1);
      expect(t.startMs).toBeLessThanOrEqual(t.durationMs * 0.7);
    }
  });
});

describe('startPointFor', () => {
  it('keeps room for a 2s clip on a short track', () => {
    const d = 12_000;
    for (let s = 0; s < 50; s++) {
      expect(startPointFor(d, seededRng(s)) + 3500).toBeLessThanOrEqual(d);
    }
  });
  it('never goes negative on a tiny track', () => {
    expect(startPointFor(2_000, seededRng(1))).toBe(0);
  });
});
