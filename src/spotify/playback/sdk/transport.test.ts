// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SpotifyApi, SpotifyApiError } from "../../api";
import { PlaybackError } from "../adapter";
import { TransportError, type TransportEvent } from "../transport";
import { createSdkTransport } from "./transport";

type Handler = (payload: unknown) => void;

const calls: string[] = [];

class StubPlayer {
	static instances: StubPlayer[] = [];
	static onConnect: (player: StubPlayer) => boolean = (player) => {
		player.emit("ready", { device_id: "dev-1" });
		return true;
	};

	readonly handlers = new Map<string, Handler[]>();
	readonly options: Spotify.PlayerInit;
	currentState: unknown = null;
	volume = 0.5;
	readonly pause = vi.fn(async () => {});
	readonly resume = vi.fn(async () => {});
	readonly seek = vi.fn(async (_ms: number) => {});
	readonly setVolume = vi.fn(async (volume: number) => {
		this.volume = volume;
	});
	readonly disconnect = vi.fn(() => {
		calls.push("disconnect");
	});

	constructor(options: Spotify.PlayerInit) {
		this.options = options;
		calls.push("construct");
		StubPlayer.instances.push(this);
	}

	addListener(event: string, handler: Handler) {
		this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
		return true;
	}

	emit(event: string, payload?: unknown) {
		for (const handler of this.handlers.get(event) ?? []) handler(payload);
	}

	async activateElement() {
		calls.push("activateElement");
	}

	async connect() {
		calls.push("connect");
		return StubPlayer.onConnect(this);
	}

	async getCurrentState() {
		return this.currentState;
	}

	async getVolume() {
		return this.volume;
	}
}

function fakeApi() {
	const put = vi.fn<SpotifyApi["put"]>(async (target) => {
		calls.push(`put ${target}`);
	});
	const api: SpotifyApi = { get: vi.fn(), put };
	return { api, put };
}

function setup() {
	const { api, put } = fakeApi();
	const loadSdk = vi.fn(async () => {
		calls.push("load");
	});
	const transport = createSdkTransport({
		getAccessToken: async () => "token",
		api,
		loadSdk,
	});
	return { transport, put, loadSdk };
}

function lastPlayer(): StubPlayer {
	const player = StubPlayer.instances.at(-1);
	if (!player) throw new Error("no player was constructed");
	return player;
}

beforeEach(() => {
	calls.length = 0;
	StubPlayer.instances = [];
	StubPlayer.onConnect = (player) => {
		player.emit("ready", { device_id: "dev-1" });
		return true;
	};
	(window as unknown as { Spotify: unknown }).Spotify = { Player: StubPlayer };
});

afterEach(() => {
	delete (window as { Spotify?: unknown }).Spotify;
});

describe("connect", () => {
	it("runs load, construct, activateElement, connect, then transfers without playing", async () => {
		const { transport, put } = setup();
		await transport.connect({ volume: 0.3 });

		expect(calls).toEqual([
			"load",
			"construct",
			"activateElement",
			"connect",
			"put /me/player",
		]);
		expect(put).toHaveBeenCalledWith("/me/player", {
			device_ids: ["dev-1"],
			play: false,
		});
		expect(lastPlayer().options.name).toBe("harkdle");
		expect(lastPlayer().options.volume).toBe(0.3);
	});

	it("hands the SDK a token callback backed by getAccessToken", async () => {
		const { transport } = setup();
		await transport.connect({ volume: 0.5 });
		const cb = vi.fn();
		lastPlayer().options.getOAuthToken(cb);
		await vi.waitFor(() => expect(cb).toHaveBeenCalledWith("token"));
	});

	it("does nothing on a second connect", async () => {
		const { transport, put, loadSdk } = setup();
		await transport.connect({ volume: 0.5 });
		await transport.connect({ volume: 0.5 });

		expect(StubPlayer.instances).toHaveLength(1);
		expect(loadSdk).toHaveBeenCalledTimes(1);
		expect(put).toHaveBeenCalledTimes(1);
	});

	it.each([
		["initialization_error", "initialization"],
		["authentication_error", "authentication"],
		["account_error", "account"],
	] as const)(
		"rejects with %s as a %s PlaybackError and allows a retry",
		async (event, kind) => {
			StubPlayer.onConnect = (player) => {
				player.emit(event, { message: "nope" });
				return true;
			};
			const { transport } = setup();

			const error = await transport.connect({ volume: 0.5 }).catch((e) => e);
			expect(error).toBeInstanceOf(PlaybackError);
			expect(error.kind).toBe(kind);
			expect(lastPlayer().disconnect).toHaveBeenCalled();

			StubPlayer.onConnect = (player) => {
				player.emit("ready", { device_id: "dev-2" });
				return true;
			};
			await transport.connect({ volume: 0.5 });
			expect(StubPlayer.instances).toHaveLength(2);
		},
	);

	it("rejects with an initialization PlaybackError when connect returns false", async () => {
		StubPlayer.onConnect = () => false;
		const { transport } = setup();

		const error = await transport.connect({ volume: 0.5 }).catch((e) => e);
		expect(error).toBeInstanceOf(PlaybackError);
		expect(error.kind).toBe("initialization");
	});

	it("rejects with the load error and builds no player", async () => {
		const failure = new PlaybackError("sdk-load", "blocked");
		const transport = createSdkTransport({
			getAccessToken: async () => "token",
			api: fakeApi().api,
			loadSdk: async () => {
				throw failure;
			},
		});

		await expect(transport.connect({ volume: 0.5 })).rejects.toBe(failure);
		expect(StubPlayer.instances).toHaveLength(0);
	});
});

describe("events", () => {
	it("fans state, not-ready and error events out and stops after unsubscribe", async () => {
		const { transport } = setup();
		const events: TransportEvent[] = [];
		const unsubscribe = transport.subscribe((e) => events.push(e));
		await transport.connect({ volume: 0.5 });
		const player = lastPlayer();

		player.emit("player_state_changed", {
			position: 1200,
			paused: false,
			track_window: { current_track: { uri: "spotify:track:a" } },
		});
		player.emit("player_state_changed", null);
		player.emit("not_ready", { device_id: "dev-1" });
		player.emit("playback_error", { message: "boom" });
		player.emit("account_error", { message: "free" });

		expect(events).toEqual([
			{
				type: "state",
				state: {
					positionMs: 1200,
					paused: false,
					uri: "spotify:track:a",
					linkedFromUri: null,
				},
			},
			{ type: "state", state: null },
			{ type: "not-ready" },
			{ type: "error", kind: "playback", message: "boom" },
			{ type: "error", kind: "account", message: "free" },
		]);

		unsubscribe();
		player.emit("not_ready", { device_id: "dev-1" });
		expect(events).toHaveLength(5);
	});
});

describe("api commands", () => {
	it("sends playFrom, pauseViaApi, seekViaApi and transferHere to the device", async () => {
		const { transport, put } = setup();
		await transport.connect({ volume: 0.5 });
		put.mockClear();

		await transport.playFrom("spotify:track:a", 4500);
		await transport.pauseViaApi();
		await transport.seekViaApi(1234.6);
		await transport.transferHere();

		expect(put.mock.calls).toEqual([
			[
				"/me/player/play?device_id=dev-1",
				{ uris: ["spotify:track:a"], position_ms: 4500 },
			],
			["/me/player/pause?device_id=dev-1", undefined],
			["/me/player/seek?position_ms=1235&device_id=dev-1", undefined],
			["/me/player", { device_ids: ["dev-1"], play: false }],
		]);
	});

	it("maps not-found to device-gone and other failures to request-failed", async () => {
		const { transport, put } = setup();
		await transport.connect({ volume: 0.5 });

		put.mockRejectedValueOnce(new SpotifyApiError("not-found", "gone", 404));
		const gone = await transport.playFrom("spotify:track:a", 0).catch((e) => e);
		expect(gone).toBeInstanceOf(TransportError);
		expect(gone.kind).toBe("device-gone");

		put.mockRejectedValueOnce(new SpotifyApiError("not-found", "gone", 404));
		const transfer = await transport.transferHere().catch((e) => e);
		expect(transfer.kind).toBe("device-gone");

		put.mockRejectedValueOnce(new SpotifyApiError("network", "offline"));
		const failed = await transport.pauseViaApi().catch((e) => e);
		expect(failed).toBeInstanceOf(TransportError);
		expect(failed.kind).toBe("request-failed");
	});

	it("throws not-connected for every command before connect", async () => {
		const { transport, put } = setup();
		const commands = [
			() => transport.transferHere(),
			() => transport.playFrom("spotify:track:a", 0),
			() => transport.pause(),
			() => transport.pauseViaApi(),
			() => transport.resume(),
			() => transport.seek(0),
			() => transport.seekViaApi(0),
			() => transport.getState(),
			() => transport.setVolume(0.5),
			() => transport.getVolume(),
		];
		for (const command of commands) {
			const error = await command().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(TransportError);
			expect((error as TransportError).kind).toBe("not-connected");
		}
		expect(put).not.toHaveBeenCalled();
	});
});

describe("sdk commands", () => {
	it("forwards pause, resume, seek and volume to the player", async () => {
		const { transport } = setup();
		await transport.connect({ volume: 0.5 });
		const player = lastPlayer();

		await transport.pause();
		await transport.resume();
		await transport.seek(900);
		await transport.setVolume(0.2);

		expect(player.pause).toHaveBeenCalledTimes(1);
		expect(player.resume).toHaveBeenCalledTimes(1);
		expect(player.seek).toHaveBeenCalledWith(900);
		expect(player.setVolume).toHaveBeenCalledWith(0.2);
		expect(await transport.getVolume()).toBe(0.2);
	});

	it("maps getState including linked_from, and null", async () => {
		const { transport } = setup();
		await transport.connect({ volume: 0.5 });
		const player = lastPlayer();

		expect(await transport.getState()).toBeNull();

		player.currentState = {
			position: 3000,
			paused: true,
			track_window: {
				current_track: {
					uri: "spotify:track:relinked",
					linked_from: { uri: "spotify:track:original" },
				},
			},
		};
		expect(await transport.getState()).toEqual({
			positionMs: 3000,
			paused: true,
			uri: "spotify:track:relinked",
			linkedFromUri: "spotify:track:original",
		});
	});
});

describe("disconnect", () => {
	it("drops the player so the next connect builds a fresh one", async () => {
		const { transport } = setup();
		await transport.connect({ volume: 0.5 });
		const first = lastPlayer();

		transport.disconnect();
		expect(first.disconnect).toHaveBeenCalledTimes(1);
		await expect(transport.pause()).rejects.toMatchObject({
			kind: "not-connected",
		});

		StubPlayer.onConnect = (player) => {
			player.emit("ready", { device_id: "dev-2" });
			return true;
		};
		await transport.connect({ volume: 0.5 });
		expect(StubPlayer.instances).toHaveLength(2);
		expect(lastPlayer()).not.toBe(first);
		await transport.pauseViaApi();
		expect(calls.at(-1)).toBe("put /me/player/pause?device_id=dev-2");
	});
});
