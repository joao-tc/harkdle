/** Contract the flows depend on. Free of SDK types so tests can fake it. */
export interface PlayerState {
  positionMs: number;
  paused: boolean;
  uri: string | null;
}

export interface SdkPlayer {
  /** Resolves with the device ID once `ready` fired and playback was transferred. */
  connect(): Promise<string>;
  /** Starts `uri` at `positionMs` playing (Web API PUT /me/player/play). */
  playFrom(uri: string, positionMs: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  /** Last known position, extrapolated by the SDK between state events is NOT done here: raw reported position. */
  getPositionMs(): Promise<number>;
  onState(cb: (s: PlayerState) => void): void;
  /** Subscribes to SDK errors (playback_error, account_error, ...). */
  onError(cb: (message: string) => void): void;
}

const API = 'https://api.spotify.com/v1';

export function createSdkPlayer(getToken: () => Promise<string>, name = 'Harkdle latency spike'): SdkPlayer {
  let player: Spotify.Player | null = null;
  let deviceId: string | null = null;
  const stateCbs: Array<(s: PlayerState) => void> = [];
  const errorCbs: Array<(m: string) => void> = [];

  const api = async (method: string, path: string, body?: unknown): Promise<void> => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  };

  const need = (): Spotify.Player => {
    if (!player) throw new Error('player not connected');
    return player;
  };

  return {
    async connect() {
      if (!window.Spotify) {
        await new Promise<void>((resolve) => {
          window.onSpotifyWebPlaybackSDKReady = () => resolve();
        });
      }
      const p = new Spotify.Player({
        name,
        getOAuthToken: (cb) => void getToken().then(cb),
        volume: 0.5,
      });
      player = p;
      for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error'] as const) {
        p.addListener(ev, ({ message }) => errorCbs.forEach((cb) => cb(`${ev}: ${message}`)));
      }
      p.addListener('player_state_changed', (s) => {
        if (!s) return;
        const state: PlayerState = { positionMs: s.position, paused: s.paused, uri: s.track_window.current_track?.uri ?? null };
        stateCbs.forEach((cb) => cb(state));
      });
      const ready = new Promise<string>((resolve, reject) => {
        p.addListener('ready', ({ device_id }) => resolve(device_id));
        p.addListener('initialization_error', ({ message }) => reject(new Error(message)));
        p.addListener('authentication_error', ({ message }) => reject(new Error(message)));
        p.addListener('account_error', ({ message }) => reject(new Error(`account_error: ${message}`)));
      });
      // connect() must run from a user gesture; activateElement unlocks audio on browsers that need it.
      await p.activateElement();
      if (!(await p.connect())) throw new Error('player.connect() returned false');
      deviceId = await ready;
      await api('PUT', '/me/player', { device_ids: [deviceId], play: false });
      return deviceId;
    },
    async playFrom(uri, positionMs) {
      if (!deviceId) throw new Error('no device');
      await api('PUT', `/me/player/play?device_id=${deviceId}`, { uris: [uri], position_ms: positionMs });
    },
    async pause() {
      await need().pause();
    },
    async resume() {
      await need().resume();
    },
    async seek(ms) {
      await need().seek(ms);
    },
    async getPositionMs() {
      const s = await need().getCurrentState();
      return s ? s.position : 0;
    },
    onState(cb) {
      stateCbs.push(cb);
    },
    onError(cb) {
      errorCbs.push(cb);
    },
  };
}
