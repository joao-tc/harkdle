/** Contract the flows depend on. Free of SDK types so tests can fake it. */
export interface PlayerState {
  positionMs: number;
  paused: boolean;
  uri: string | null;
  /** the URI that was requested, when Spotify relinked it to another one for this market */
  linkedFromUri: string | null;
}

export interface SdkPlayer {
  /** Resolves with the device ID once `ready` fired and playback was transferred. */
  connect(): Promise<string>;
  /** Starts `uri` at `positionMs` playing (Web API PUT /me/player/play). */
  playFrom(uri: string, positionMs: number): Promise<void>;
  pause(): Promise<void>;
  /** Pauses through the Web API (PUT /me/player/pause) instead of the SDK. */
  pauseViaApi(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  /** Seeks through the Web API (PUT /me/player/seek) instead of the SDK. */
  seekViaApi(ms: number): Promise<void>;
  /** Current SDK state (position, paused flag and the track it belongs to), or null before any track is loaded. */
  getState(): Promise<PlayerState | null>;
  /** Drops the current SDK device and connects a fresh one (e.g. after the device vanished: PUT /me/player/play → 404). */
  reconnect(): Promise<string>;
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

  const toState = (s: Spotify.PlaybackState): PlayerState => ({
    positionMs: s.position,
    paused: s.paused,
    uri: s.track_window.current_track?.uri ?? null,
    linkedFromUri: s.track_window.current_track?.linked_from?.uri ?? null,
  });

  const need = (): Spotify.Player => {
    if (!player) throw new Error('player not connected');
    return player;
  };

  const connect = async (): Promise<string> => {
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
      const state = toState(s);
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
  };

  return {
    connect,
    async reconnect() {
      player?.disconnect();
      player = null;
      deviceId = null;
      return connect();
    },
    async playFrom(uri, positionMs) {
      if (!deviceId) throw new Error('no device');
      await api('PUT', `/me/player/play?device_id=${deviceId}`, { uris: [uri], position_ms: positionMs });
    },
    async pause() {
      await need().pause();
    },
    async pauseViaApi() {
      if (!deviceId) throw new Error('no device');
      await api('PUT', `/me/player/pause?device_id=${deviceId}`);
    },
    async resume() {
      await need().resume();
    },
    async seek(ms) {
      await need().seek(ms);
    },
    async seekViaApi(ms) {
      if (!deviceId) throw new Error('no device');
      await api('PUT', `/me/player/seek?position_ms=${Math.round(ms)}&device_id=${deviceId}`);
    },
    async getState() {
      const s = await need().getCurrentState();
      return s ? toState(s) : null;
    },
    onState(cb) {
      stateCbs.push(cb);
    },
    onError(cb) {
      errorCbs.push(cb);
    },
  };
}
