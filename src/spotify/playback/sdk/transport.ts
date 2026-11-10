import { type SpotifyApi, SpotifyApiError } from "../../api";
import { PlaybackError } from "../adapter";
import {
	type PlayerTransport,
	TransportError,
	type TransportEvent,
	type TransportState,
} from "../transport";
import { loadSdk } from "./loadSdk";

export interface SdkTransportDeps {
	getAccessToken(): Promise<string>;
	api: SpotifyApi;
	deviceName?: string;
	loadSdk?: () => Promise<void>;
}

const CONNECT_ERRORS = [
	["initialization_error", "initialization"],
	["authentication_error", "authentication"],
	["account_error", "account"],
] as const;

function toState(state: Spotify.PlaybackState): TransportState {
	const track = state.track_window.current_track;
	return {
		positionMs: state.position,
		paused: state.paused,
		uri: track.uri,
		linkedFromUri: track.linked_from?.uri ?? null,
	};
}

export function createSdkTransport(deps: SdkTransportDeps): PlayerTransport {
	const load = deps.loadSdk ?? loadSdk;
	const listeners = new Set<(event: TransportEvent) => void>();
	let player: Spotify.Player | null = null;
	let deviceId: string | null = null;
	let connecting: Promise<void> | null = null;

	function emit(event: TransportEvent) {
		for (const listener of [...listeners]) listener(event);
	}

	function needPlayer(): Spotify.Player {
		if (!player) throw new TransportError("not-connected", "not connected");
		return player;
	}

	function needDevice(): string {
		if (!deviceId) throw new TransportError("not-connected", "not connected");
		return deviceId;
	}

	async function put(target: string, body?: unknown): Promise<void> {
		try {
			await deps.api.put(target, body);
		} catch (e) {
			if (e instanceof SpotifyApiError && e.kind === "not-found") {
				throw new TransportError("device-gone", e.message);
			}
			throw new TransportError(
				"request-failed",
				e instanceof Error ? e.message : String(e),
			);
		}
	}

	function discard() {
		player?.disconnect();
		player = null;
		deviceId = null;
		connecting = null;
	}

	async function start(volume: number): Promise<void> {
		await load();
		const p = new Spotify.Player({
			name: deps.deviceName ?? "harkdle",
			getOAuthToken: (cb) => void deps.getAccessToken().then(cb),
			volume,
		});
		player = p;

		const ready = new Promise<string>((resolve, reject) => {
			p.addListener("ready", ({ device_id }) => resolve(device_id));
			for (const [event, kind] of CONNECT_ERRORS) {
				p.addListener(event, ({ message }) => {
					emit({ type: "error", kind, message });
					reject(new PlaybackError(kind, message));
				});
			}
		});
		// The rejection is consumed below, but may fire before we await `ready`.
		ready.catch(() => {});
		p.addListener("not_ready", () => emit({ type: "not-ready" }));
		p.addListener("player_state_changed", (state) =>
			emit({ type: "state", state: state ? toState(state) : null }),
		);
		p.addListener("playback_error", ({ message }) =>
			emit({ type: "error", kind: "playback", message }),
		);

		// Must run inside the user gesture that called connect().
		await p.activateElement();
		if (!(await p.connect())) {
			throw new PlaybackError(
				"initialization",
				"the Spotify player failed to connect",
			);
		}
		deviceId = await ready;
		await transport.transferHere();
	}

	const transport: PlayerTransport = {
		connect({ volume }) {
			connecting ??= start(volume).catch((e: unknown) => {
				discard();
				throw e;
			});
			return connecting;
		},
		disconnect: discard,
		async transferHere() {
			await put("/me/player", { device_ids: [needDevice()], play: false });
		},
		async playFrom(uri, positionMs) {
			await put(`/me/player/play?device_id=${needDevice()}`, {
				uris: [uri],
				position_ms: positionMs,
			});
		},
		async pause() {
			await needPlayer().pause();
		},
		async pauseViaApi() {
			await put(`/me/player/pause?device_id=${needDevice()}`);
		},
		async resume() {
			await needPlayer().resume();
		},
		async seek(positionMs) {
			await needPlayer().seek(positionMs);
		},
		async seekViaApi(positionMs) {
			await put(
				`/me/player/seek?position_ms=${Math.round(positionMs)}&device_id=${needDevice()}`,
			);
		},
		async getState() {
			const state = await needPlayer().getCurrentState();
			return state ? toState(state) : null;
		},
		async setVolume(volume) {
			await needPlayer().setVolume(volume);
		},
		async getVolume() {
			return needPlayer().getVolume();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
	return transport;
}
