import { describe, expect, it } from "vitest";
import type { CueTarget } from "./adapter";
import { type ClipControl, runClip } from "./clip";
import { ConfirmTimeout, POLL_MS, TIMEOUT_MS } from "./confirm";
import { createFakeTransport } from "./fakeTransport";

const A = "spotify:track:a";
const TARGET: CueTarget = { uri: A, startMs: 10_000 };
const RESUME_MS = 5;

async function cued(options: Parameters<typeof createFakeTransport>[0]) {
	const fake = createFakeTransport(options);
	const deps = {
		transport: fake.transport,
		clock: fake.clock,
		takeError: () => null as string | null,
	};
	await fake.transport.playFrom(A, TARGET.startMs);
	await fake.transport.pause();
	const control: ClipControl = { cancel: null };
	const state = async () => {
		const s = await fake.transport.getState();
		if (!s) throw new Error("no state");
		return s;
	};
	return { fake, deps, control, state, origin: (await state()).positionMs };
}

describe("runClip", () => {
	it.each([1_000, 16_000])(
		"ends a %i ms clip within one poll of the target",
		async (lengthMs) => {
			const latencyMs = 100;
			const { fake, deps, control, state, origin } = await cued({ latencyMs });

			const result = await runClip(deps, TARGET, origin, lengthMs, control);

			expect(result.end).toBe("ended");
			const overshoot = (await state()).positionMs - (origin + lengthMs);
			expect(overshoot).toBeGreaterThanOrEqual(0);
			expect(overshoot).toBeLessThanOrEqual(POLL_MS);
			expect((await state()).paused).toBe(true);
			expect(result.resumeToFirstPositionMs).toBeGreaterThanOrEqual(
				RESUME_MS + latencyMs,
			);
			expect(result.resumeToFirstPositionMs).toBeLessThanOrEqual(
				RESUME_MS + latencyMs + POLL_MS,
			);
			expect(fake.audibleMs()).toBeGreaterThanOrEqual(lengthMs);
		},
	);

	it("does not take the paused position of the cue as movement", async () => {
		const latencyMs = 200;
		const { deps, control, state } = await cued({ latencyMs });
		const paused = (await state()).positionMs;

		const result = await runClip(deps, TARGET, paused - 500, 1_000, control);

		expect(result.end).toBe("ended");
		expect(result.resumeToFirstPositionMs).toBeGreaterThanOrEqual(
			RESUME_MS + latencyMs,
		);
	});

	it("runs a second clip on the same track after the first", async () => {
		const { fake, deps, control, state, origin } = await cued({
			latencyMs: 50,
		});
		await runClip(deps, TARGET, origin, 1_000, control);
		await fake.transport.seek(origin);
		const before = fake.audibleMs();

		const result = await runClip(deps, TARGET, origin, 1_000, control);

		expect(result.end).toBe("ended");
		expect(fake.audibleMs() - before).toBeGreaterThanOrEqual(1_000);
		expect((await state()).positionMs).toBeGreaterThanOrEqual(origin + 1_000);
	});

	describe("cancel", () => {
		it.each(["hidden", "stopped", "interrupted"] as const)(
			"pauses and ends as %s",
			async (cancel) => {
				const { fake, deps, control, state, origin } = await cued({
					latencyMs: 20,
				});
				fake.schedule(fake.clock.now() + 300, () => {
					control.cancel = cancel;
				});

				const result = await runClip(deps, TARGET, origin, 5_000, control);

				expect(result.end).toBe(cancel);
				expect((await state()).paused).toBe(true);
				expect((await state()).positionMs).toBeLessThan(origin + 1_000);
				expect(fake.calls.slice(fake.calls.indexOf("resume"))).toContain(
					"pause",
				);
			},
		);

		it("leaves the player playing on revealed", async () => {
			const { fake, deps, control, state, origin } = await cued({
				latencyMs: 20,
			});
			fake.schedule(fake.clock.now() + 300, () => {
				control.cancel = "revealed";
			});

			const result = await runClip(deps, TARGET, origin, 5_000, control);

			expect(result.end).toBe("revealed");
			expect((await state()).paused).toBe(false);
			expect(fake.calls.slice(fake.calls.indexOf("resume"))).toEqual([
				"resume",
			]);
		});

		it("is honoured while waiting for the first position change", async () => {
			const { fake, deps, control, state, origin } = await cued({
				latencyMs: 2_000,
			});
			const start = fake.clock.now();
			fake.schedule(start + 200, () => {
				control.cancel = "hidden";
			});

			const result = await runClip(deps, TARGET, origin, 1_000, control);

			expect(result.end).toBe("hidden");
			expect(fake.clock.now() - start).toBeLessThan(200 + POLL_MS + 1);
			expect((await state()).paused).toBe(true);
		});

		it("swallows a failing pause when interrupted", async () => {
			const { fake, deps, control, origin } = await cued({ latencyMs: 20 });
			const transport = {
				...fake.transport,
				pause: () => Promise.reject(new Error("device gone")),
			};
			control.cancel = "interrupted";

			const result = await runClip(
				{ ...deps, transport },
				TARGET,
				origin,
				1_000,
				control,
			);

			expect(result.end).toBe("interrupted");
		});
	});

	describe("timeouts", () => {
		it("fails when the position never moves", async () => {
			const { fake, deps, control, origin } = await cued({
				latencyMs: 10_000_000,
			});
			const start = fake.clock.now();

			await expect(
				runClip(deps, TARGET, origin, 1_000, control),
			).rejects.toBeInstanceOf(ConfirmTimeout);
			expect(fake.clock.now() - start).toBeGreaterThanOrEqual(TIMEOUT_MS);
		});

		it("fails when the position never reaches the target", async () => {
			const { fake, deps, control, origin } = await cued({ latencyMs: 0 });
			let reads = 0;
			const transport = {
				...fake.transport,
				getState: async () => ({
					positionMs: origin + 1 + Math.min(reads++, 5),
					paused: false,
					uri: A,
					linkedFromUri: null,
				}),
			};
			const start = fake.clock.now();

			await expect(
				runClip({ ...deps, transport }, TARGET, origin, 1_000, control),
			).rejects.toBeInstanceOf(ConfirmTimeout);
			expect(fake.clock.now() - start).toBeGreaterThanOrEqual(
				1_000 + TIMEOUT_MS,
			);
		});

		it("fails at once on a transport error", async () => {
			const { deps, control, origin } = await cued({ latencyMs: 20 });

			await expect(
				runClip(
					{ ...deps, takeError: () => "playback error" },
					TARGET,
					origin,
					1_000,
					control,
				),
			).rejects.toThrow("playback error");
		});
	});
});
