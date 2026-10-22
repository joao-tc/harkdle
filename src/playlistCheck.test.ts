import { describe, expect, it } from 'vitest';
import { describeItem, describeItems, fetchAllItems, parsePlaylistId, type FetchLike } from './playlistCheck';

const track = { type: 'track', id: 't1', uri: 'spotify:track:t1', name: 'A', is_playable: true, duration_ms: 1000, external_ids: { isrc: 'X1' } };

describe('describeItem', () => {
  it('reads the new item shape', () => {
    expect(describeItem({ item: track })).toMatchObject({ shape: 'item', isPlayable: true, isrc: 'X1', durationMs: 1000 });
  });
  it('reads the old track shape', () => {
    expect(describeItem({ track })).toMatchObject({ shape: 'track', id: 't1' });
  });
  it('flags an episode', () => {
    expect(describeItem({ item: { type: 'episode', id: 'e1' } })).toMatchObject({ type: 'episode', isrc: null });
  });
  it('flags a local file', () => {
    expect(describeItem({ is_local: true, item: { type: 'track', is_local: true } }).isLocal).toBe(true);
  });
  it('reports missing is_playable as null', () => {
    expect(describeItem({ item: { ...track, is_playable: undefined } }).isPlayable).toBeNull();
  });
  it('detects a relinked track', () => {
    expect(describeItem({ item: { ...track, linked_from: { id: 'orig' } } }).hasLinkedFrom).toBe(true);
  });
  it('does not throw on null or junk', () => {
    expect(describeItem(null).shape).toBe('none');
    expect(describeItem({ item: null }).shape).toBe('none');
  });
});

describe('describeItems', () => {
  it('lists missing core fields', () => {
    const { report } = describeItems([{ item: { type: 'track', id: 'x' } }]);
    expect(report.missing).toEqual(expect.arrayContaining(['items.track', 'is_playable', 'external_ids', 'duration_ms']));
    expect(report.missing).not.toContain('items.item');
  });
});

describe('fetchAllItems', () => {
  it('follows next across two pages', async () => {
    const urls: string[] = [];
    const pages: Record<string, unknown> = {
      first: { items: [{ item: track }], next: 'https://api.spotify.com/v1/page2' },
      page2: { items: [{ item: track }, { item: track }], next: null },
    };
    const fetchFn: FetchLike = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => (url.includes('page2') ? pages.page2 : pages.first) };
    };
    const all = await fetchAllItems('pl', async () => 'tok', fetchFn);
    expect(all).toHaveLength(3);
    expect(urls[0]).toContain('/playlists/pl/items?market=from_token&limit=100');
  });
  it('throws with the status on a refusal', async () => {
    const fetchFn: FetchLike = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(fetchAllItems('pl', async () => 't', fetchFn)).rejects.toThrow('403');
  });
});

describe('parsePlaylistId', () => {
  it('extracts the ID from a URI, a URL, or a bare ID', () => {
    expect(parsePlaylistId('spotify:playlist:00SwfVAQVPEVDy75HqlLsD')).toBe('00SwfVAQVPEVDy75HqlLsD');
    expect(parsePlaylistId(' https://open.spotify.com/playlist/00SwfVAQVPEVDy75HqlLsD?si=abc ')).toBe('00SwfVAQVPEVDy75HqlLsD');
    expect(parsePlaylistId('00SwfVAQVPEVDy75HqlLsD')).toBe('00SwfVAQVPEVDy75HqlLsD');
  });
});
