import { describe, expect, it } from "vitest";
import { ConfirmTimeout } from "./confirm";
import { runCue } from "./cue";
import {
	createFakeTransport,
	type FakeTransportOptions,
} from "./fakeTransport";
import { TransportError } from "./transport";

const TARGET = { uri: "spotify:track:a", startMs: 30_000 };
const USER_VOLUME = 0.7;
const NEVER_AUDIBLE = { latencyMs: 600_000 };

function setup(options: FakeTransportOptions) {
	const f = createFakeTransport(options);
	const deps = {
		transport: f.transport,
		clock: f.clock,
		takeError: () => null,
		getVolume: () => USER_VOLUME,
	};
	return { f, deps };
}

describe("runCue", () => {
	it("mutes before playing, restores after the seek, and stays inaudible throughout", async () => {
		const { f, deps } = setup({ latencyMs: 20 });

		const { originMs } = await runCue(deps, TARGET);

		const playAt = f.calls.findIndex((c) => c.startsWith("playFrom"));
		expect(f.calls.indexOf("setVolume 0")).toBeLessThan(playAt);
		expect(f.calls.at(-1)).toBe(`setVolume ${USER_VOLUME}`);
		expect(f.calls.indexOf("seek 30000")).toBeLessThan(f.calls.length - 1);
		expect(f.audibleMs()).toBe(0);
		expect(f.volume()).toBe(USER_VOLUME);
		expect(Math.abs(originMs - TARGET.startMs)).toBeLessThanOrEqual(50);
		expect((await f.transport.getState())?.paused).toBe(true);
	});

	it("ends paused at the start point through the Web API when the SDK ignores pause and seek", async () => {
		const { f, deps } = setup({
			latencyMs: 20,
			sdkPauseIgnored: true,
			sdkSeekIgnored: true,
		});

		const { originMs } = await runCue(deps, TARGET);

		expect(f.calls).toContain("pauseViaApi");
		expect(f.calls).toContain("seekViaApi 30000");
		const state = await f.transport.getState();
		expect(state?.paused).toBe(true);
		expect(
			Math.abs((state?.positionMs ?? 0) - TARGET.startMs),
		).toBeLessThanOrEqual(50);
		expect(originMs).toBe(state?.positionMs);
		expect(f.audibleMs()).toBe(0);
	});

	it("handles a relinked track", async () => {
		const { f, deps } = setup({
			latencyMs: 20,
			relinkedTo: "spotify:track:relinked",
		});

		const { originMs } = await runCue(deps, TARGET);

		expect(Math.abs(originMs - TARGET.startMs)).toBeLessThanOrEqual(50);
		expect(f.audibleMs()).toBe(0);
	});

	it("does not count the stale previous track as playing", async () => {
		const { f, deps } = setup({ latencyMs: 300 });

		const { originMs } = await runCue(deps, TARGET);

		expect(f.clock.now()).toBeGreaterThanOrEqual(300);
		expect(Math.abs(originMs - TARGET.startMs)).toBeLessThanOrEqual(50);
	});

	describe("restoring the volume when the cue fails", () => {
		it("propagates device-gone unchanged when playFrom rejects", async () => {
			const { f, deps } = setup({ latencyMs: 20, play404Times: 1 });

			const error = await runCue(deps, TARGET).catch((e) => e);

			expect(error).toBeInstanceOf(TransportError);
			expect(error.kind).toBe("device-gone");
			expect(f.calls.at(-1)).toBe(`setVolume ${USER_VOLUME}`);
			expect(f.volume()).toBe(USER_VOLUME);
		});

		it("throws the timeout when the track never becomes audible", async () => {
			const { f, deps } = setup(NEVER_AUDIBLE);

			const error = await runCue(deps, TARGET).catch((e) => e);

			expect(error).toBeInstanceOf(ConfirmTimeout);
			expect(error.message).not.toContain("mute not confirmed");
			expect(f.volume()).toBe(USER_VOLUME);
			expect(f.audibleMs()).toBe(0);
		});

		it("throws the timeout when the pause never confirms", async () => {
			const { f, deps } = setup({ latencyMs: 20 });
			const stuck = {
				...deps,
				transport: {
					...f.transport,
					pause: async () => {},
					pauseViaApi: async () => {},
				},
			};

			const error = await runCue(stuck, TARGET).catch((e) => e);

			expect(error).toBeInstanceOf(ConfirmTimeout);
			expect(error.message).toContain("cue pause");
			expect(f.volume()).toBe(USER_VOLUME);
		});

		it("keeps the cue's error when the restore itself rejects", async () => {
			const { f, deps } = setup({ latencyMs: 20, play404Times: 1 });
			const failingRestore = {
				...deps,
				transport: {
					...f.transport,
					setVolume: async (v: number) => {
						await f.transport.setVolume(v);
						if (v !== 0) throw new Error("restore failed");
					},
				},
			};

			const error = await runCue(failingRestore, TARGET).catch((e) => e);

			expect(error).toBeInstanceOf(TransportError);
		});
	});

	describe("when the mute is not confirmed", () => {
		it("still completes the cue", async () => {
			const { f, deps } = setup({ latencyMs: 20, setVolumeIgnored: true });

			const { originMs } = await runCue(deps, TARGET);

			expect(Math.abs(originMs - TARGET.startMs)).toBeLessThanOrEqual(50);
			expect(f.calls.at(-1)).toBe(`setVolume ${USER_VOLUME}`);
		});

		it("says so in the error of a failed cue", async () => {
			const { deps } = setup({ ...NEVER_AUDIBLE, setVolumeIgnored: true });

			const error = await runCue(deps, TARGET).catch((e) => e);

			expect(error).toBeInstanceOf(ConfirmTimeout);
			expect(error.message).toContain("mute not confirmed");
		});

		it("treats a setVolume rejection as not confirmed", async () => {
			const { f, deps } = setup(NEVER_AUDIBLE);
			const rejecting = {
				...deps,
				transport: {
					...f.transport,
					setVolume: async (v: number) => {
						if (v === 0) throw new Error("boom");
						await f.transport.setVolume(v);
					},
				},
			};

			const error = await runCue(rejecting, TARGET).catch((e) => e);

			expect(error.message).toContain("mute not confirmed");
		});
	});
});
