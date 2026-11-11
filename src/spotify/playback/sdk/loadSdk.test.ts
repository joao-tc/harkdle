// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackError } from "../adapter";
import { loadSdk } from "./loadSdk";

const SELECTOR = 'script[src="https://sdk.scdn.co/spotify-player.js"]';

function fakeTimers() {
	let callback: (() => void) | null = null;
	return {
		setTimeout: vi.fn((fn: () => void) => {
			callback = fn;
			return 1;
		}),
		clearTimeout: vi.fn(() => {
			callback = null;
		}),
		fire: () => callback?.(),
	};
}

function scripts() {
	return document.querySelectorAll(SELECTOR);
}

function failWithError(promise: Promise<void>) {
	scripts()[0]?.dispatchEvent(new Event("error"));
	return promise.catch((e: unknown) => e);
}

afterEach(() => {
	for (const script of scripts()) script.remove();
	delete (window as { Spotify?: unknown }).Spotify;
	window.onSpotifyWebPlaybackSDKReady = () => {};
});

describe("loadSdk", () => {
	it("adds one script for concurrent calls and resolves them together on ready", async () => {
		const timers = fakeTimers();
		const first = loadSdk({ ...timers });
		const second = loadSdk({ ...timers });

		expect(scripts()).toHaveLength(1);
		window.onSpotifyWebPlaybackSDKReady();
		await expect(Promise.all([first, second])).resolves.toEqual([
			undefined,
			undefined,
		]);
		expect(timers.clearTimeout).toHaveBeenCalled();
	});

	it("resolves without adding a script when window.Spotify already exists", async () => {
		(window as { Spotify?: unknown }).Spotify = {};
		await expect(loadSdk(fakeTimers())).resolves.toBeUndefined();
		expect(scripts()).toHaveLength(0);
	});

	it("rejects with sdk-load on a script error and allows a retry", async () => {
		const timers = fakeTimers();
		const error = await failWithError(loadSdk({ ...timers }));

		expect(error).toBeInstanceOf(PlaybackError);
		expect((error as PlaybackError).kind).toBe("sdk-load");
		expect(scripts()).toHaveLength(0);

		const retry = loadSdk({ ...timers });
		expect(scripts()).toHaveLength(1);
		window.onSpotifyWebPlaybackSDKReady();
		await expect(retry).resolves.toBeUndefined();
	});

	it("rejects with sdk-load on timeout and allows a retry", async () => {
		const timers = fakeTimers();
		const promise = loadSdk({ ...timers, timeoutMs: 500 });
		expect(timers.setTimeout).toHaveBeenCalledWith(expect.any(Function), 500);

		timers.fire();
		const error = await promise.catch((e: unknown) => e);
		expect((error as PlaybackError).kind).toBe("sdk-load");
		expect(scripts()).toHaveLength(0);

		const retry = loadSdk({ ...timers });
		expect(scripts()).toHaveLength(1);
		window.onSpotifyWebPlaybackSDKReady();
		await expect(retry).resolves.toBeUndefined();
	});

	it("defaults the timeout to 10 seconds", async () => {
		const timers = fakeTimers();
		const promise = loadSdk({ ...timers });
		expect(timers.setTimeout).toHaveBeenCalledWith(
			expect.any(Function),
			10_000,
		);
		window.onSpotifyWebPlaybackSDKReady();
		await promise;
	});
});
