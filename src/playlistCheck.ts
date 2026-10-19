export interface RawPage {
  items?: unknown[];
  next?: string | null;
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const API = 'https://api.spotify.com/v1';

/** Pages through /playlists/{id}/items. Throws on non-2xx (status in the message) so the caller can report refusals. */
export async function fetchAllItems(
  playlistId: string,
  getToken: () => Promise<string>,
  fetchFn: FetchLike,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let url: string | null = `${API}/playlists/${encodeURIComponent(playlistId)}/items?market=from_token&limit=100`;
  while (url) {
    const res = await fetchFn(url, { headers: { Authorization: `Bearer ${await getToken()}` } });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
    const page = (await res.json()) as RawPage;
    all.push(...(page.items ?? []));
    url = page.next ?? null;
  }
  return all;
}

export interface ItemInfo {
  /** which key held the object: new `item`, old `track`, or none */
  shape: 'item' | 'track' | 'none';
  type: string | null;
  uri: string | null;
  id: string | null;
  name: string | null;
  isPlayable: boolean | null;
  hasLinkedFrom: boolean;
  isLocal: boolean;
  isrc: string | null;
  durationMs: number | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function describeItem(raw: unknown): ItemInfo {
  const wrapper = isObj(raw) ? raw : {};
  let shape: ItemInfo['shape'] = 'none';
  let obj: Record<string, unknown> = {};
  if (isObj(wrapper.item)) {
    shape = 'item';
    obj = wrapper.item;
  } else if (isObj(wrapper.track)) {
    shape = 'track';
    obj = wrapper.track;
  }
  const ext = isObj(obj.external_ids) ? obj.external_ids : {};
  return {
    shape,
    type: str(obj.type),
    uri: str(obj.uri),
    id: str(obj.id),
    name: str(obj.name),
    isPlayable: typeof obj.is_playable === 'boolean' ? obj.is_playable : null,
    hasLinkedFrom: isObj(obj.linked_from),
    isLocal: obj.is_local === true || wrapper.is_local === true,
    isrc: str(ext.isrc),
    durationMs: typeof obj.duration_ms === 'number' ? obj.duration_ms : null,
  };
}

export interface FieldReport {
  total: number;
  /** count of items per field name that were present */
  present: Record<string, number>;
  missing: string[];
}

export function describeItems(raw: unknown[]): { items: ItemInfo[]; report: FieldReport } {
  const items = raw.map(describeItem);
  const present: Record<string, number> = {
    'items.item': items.filter((i) => i.shape === 'item').length,
    'items.track': items.filter((i) => i.shape === 'track').length,
    is_playable: items.filter((i) => i.isPlayable !== null).length,
    external_ids: items.filter((i) => i.isrc !== null).length,
    linked_from: items.filter((i) => i.hasLinkedFrom).length,
    is_local: items.filter((i) => i.isLocal).length,
    duration_ms: items.filter((i) => i.durationMs !== null).length,
  };
  // linked_from and is_local are legitimately absent on most items, so only flag the assumed core fields.
  const core = ['items.item', 'items.track', 'is_playable', 'external_ids', 'duration_ms'];
  return { items, report: { total: items.length, present, missing: core.filter((k) => present[k] === 0) } };
}
