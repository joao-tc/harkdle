import { describe, expect, it } from "vitest";
import {
	ConfirmTimeout,
	GRACE_MS,
	POLL_MS,
	pauseConfirmed,
	seekConfirmed,
	TIMEOUT_MS,
	waitForState,
} from "./confirm";
import { createFakeTransport } from "./fakeTransport";
import type { PlayerTransport, TransportState } from "./transport";

const A = "spotify:track:a";
const STALE = "spotify:track:previous";

function setup(options: Parameters<typeof createFakeTransport>[0]) {
	const fake = createFakeTransport(options);
	const deps = {
		transport: fake.transport,
		clock: fake.clock,
		takeError: () => null as string | null,
	};
	return { fake, deps };
}

async function playingOn(options: Parameters<typeof createFakeTransport>[0]) {
	const ctx = setup(options);
	await ctx.fake.transport.playFrom(A, 10_000);
	await waitForState(ctx.deps, A, "playing", (s) => !s.paused);
	return ctx;
}

describe("pauseConfirmed", () => {
	it("confirms through the SDK when the pause works", async () => {
		const { fake, deps } = await playingOn({ latencyMs: 50 });

		const { state, via } = await pauseConfirmed(deps, A, "pause");

		expect(via).toBe("sdk");
		expect(state.paused).toBe(true);
		expect(fake.calls).not.toContain("pauseViaApi");
	});

	it("repeats an ignored SDK pause through the Web API after the grace period", async () => {
		const { fake, deps } = await playingOn({
			latencyMs: 50,
			sdkPauseIgnored: true,
		});
		const start = fake.clock.now();

		const { state, via } = await pauseConfirmed(deps, A, "pause");

		expect(via).toBe("webApi");
		expect(state.paused).toBe(true);
		expect(fake.calls).toContain("pauseViaApi");
		expect(fake.clock.now() - start).toBe(GRACE_MS);
	});

	it("keeps waiting when the Web API fallback throws, then times out", async () => {
		const { fake, deps } = await playingOn({
			latencyMs: 50,
			sdkPauseIgnored: true,
		});
		const transport: PlayerTransport = {
			...fake.transport,
			getState: fake.transport.getState,
			pause: fake.transport.pause,
			pauseViaApi: async () => {
				throw new Error("PUT /me/player/pause 500");
			},
		};
		const start = fake.clock.now();

		const result = pauseConfirmed({ ...deps, transport }, A, "pause");

		await expect(result).rejects.toBeInstanceOf(ConfirmTimeout);
		expect(fake.clock.now() - start).toBeGreaterThanOrEqual(TIMEOUT_MS);
		expect(fake.clock.now() - start).toBeLessThan(TIMEOUT_MS + POLL_MS);
	});
});

describe("seekConfirmed", () => {
	it("confirms through the SDK when the seek works", async () => {
		const { fake, deps } = await playingOn({ latencyMs: 50 });
		await pauseConfirmed(deps, A, "pause");

		const { state, via } = await seekConfirmed(deps, A, 30_000);

		expect(via).toBe("sdk");
		expect(state.positionMs).toBe(30_000);
		expect(fake.calls).not.toContain("seekViaApi 30000");
	});

	it("repeats an ignored SDK seek through the Web API after the grace period", async () => {
		const { fake, deps } = await playingOn({
			latencyMs: 50,
			sdkSeekIgnored: true,
		});
		await pauseConfirmed(deps, A, "pause");
		const start = fake.clock.now();

		const { state, via } = await seekConfirmed(deps, A, 30_000);

		expect(via).toBe("webApi");
		expect(state.positionMs).toBe(30_000);
		expect(fake.calls).toContain("seekViaApi 30000");
		expect(fake.clock.now() - start).toBe(GRACE_MS);
	});

	it.each([
		[30_050, "sdk"],
		[30_051, "webApi"],
	])(
		"treats a paused position of %i as confirmed via %s when the SDK seek is ignored",
		async (paused, expected) => {
			const { fake, deps } = setup({ latencyMs: 0, sdkSeekIgnored: true });
			await fake.transport.playFrom(A, paused);
			await waitForState(deps, A, "playing", (s) => !s.paused);
			await fake.transport.pause();

			const { via } = await seekConfirmed(deps, A, 30_000);

			expect(via).toBe(expected);
		},
	);
});

describe("waitForState", () => {
	it("never lets the state of another track reach the test", async () => {
		const { fake, deps } = setup({ latencyMs: 300 });
		await fake.transport.playFrom(A, 0);
		const seen: string[] = [];

		const { state, at } = await waitForState(deps, A, "track", (s) => {
			seen.push(s.uri ?? "");
			return true;
		});

		expect(seen).toEqual([A]);
		expect(state.uri).toBe(A);
		expect(at).toBeGreaterThanOrEqual(300);
	});

	it("accepts a relinked track through linkedFromUri", async () => {
		const relinked = "spotify:track:relinked";
		const { fake, deps } = setup({ latencyMs: 0, relinkedTo: relinked });
		await fake.transport.playFrom(A, 0);

		const { state } = await waitForState(deps, A, "track", () => true);

		expect(state).toMatchObject({ uri: relinked, linkedFromUri: A });
	});

	it("times out with the last raw state, even one for another track", async () => {
		const { fake, deps } = setup({ latencyMs: 60_000 });
		await fake.transport.playFrom(A, 0);
		const start = fake.clock.now();

		const error = await waitForState(deps, A, "playing", () => true).catch(
			(e: unknown) => e,
		);

		expect(error).toBeInstanceOf(ConfirmTimeout);
		expect((error as ConfirmTimeout).message).toContain("playing");
		expect((error as ConfirmTimeout).lastSeen).toMatchObject({ uri: STALE });
		expect(fake.clock.now() - start).toBeGreaterThanOrEqual(TIMEOUT_MS);
		expect(fake.clock.now() - start).toBeLessThan(TIMEOUT_MS + POLL_MS);
	});

	it("times out with a null lastSeen when the transport reports no state", async () => {
		const { fake } = setup({ latencyMs: 0 });
		const transport: PlayerTransport = {
			...fake.transport,
			getState: async (): Promise<TransportState | null> => null,
		};

		const error = await waitForState(
			{ transport, clock: fake.clock, takeError: () => null },
			A,
			"anything",
			() => true,
			100,
		).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ConfirmTimeout);
		expect((error as ConfirmTimeout).lastSeen).toBeNull();
	});

	it("fails immediately with a pending transport error", async () => {
		const { fake, deps } = setup({ latencyMs: 0 });
		await fake.transport.playFrom(A, 0);
		const start = fake.clock.now();

		const result = waitForState(
			{ ...deps, takeError: () => "playback blew up" },
			A,
			"playing",
			() => true,
		);

		await expect(result).rejects.toThrow("playback blew up");
		expect(fake.clock.now() - start).toBe(0);
	});
});
