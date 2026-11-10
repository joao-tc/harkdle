import { describe, expect, it } from "vitest";
import { createFakeTransport } from "./fakeTransport";
import { TransportError, type TransportEvent } from "./transport";

const A = "spotify:track:a";

describe("virtual clock and schedule", () => {
	it("fires scheduled work in time order while sleeping, with the clock at each fire time", async () => {
		const f = createFakeTransport({ latencyMs: 0 });
		const fired: string[] = [];
		f.schedule(300, () => fired.push(`c@${f.clock.now()}`));
		f.schedule(100, () => fired.push(`a@${f.clock.now()}`));
		f.schedule(200, () => fired.push(`b@${f.clock.now()}`));
		f.schedule(900, () => fired.push("late"));

		await f.clock.sleep(350);

		expect(fired).toEqual(["a@100", "b@200", "c@300"]);
		expect(f.clock.now()).toBe(350);
		await f.clock.sleep(550);
		expect(fired.at(-1)).toBe("late");
	});

	it("delivers emitted events to subscribers until they unsubscribe", async () => {
		const f = createFakeTransport({ latencyMs: 0 });
		const seen: TransportEvent[] = [];
		const unsubscribe = f.transport.subscribe((e) => seen.push(e));
		f.schedule(1200, () => f.emit({ type: "not-ready" }));

		await f.clock.sleep(1000);
		expect(seen).toEqual([]);
		await f.clock.sleep(300);
		expect(seen).toEqual([{ type: "not-ready" }]);

		unsubscribe();
		f.emit({ type: "not-ready" });
		expect(seen).toHaveLength(1);
	});
});

describe("playback", () => {
	it("reports the previous track until latencyMs has passed, then the new one at the right position", async () => {
		const f = createFakeTransport({ latencyMs: 300 });
		await f.transport.playFrom(A, 30_000);

		const early = await f.transport.getState();
		expect(early?.uri).toBe("spotify:track:previous");

		await f.clock.sleep(299);
		expect((await f.transport.getState())?.uri).toBe("spotify:track:previous");

		await f.clock.sleep(1);
		expect(await f.transport.getState()).toEqual({
			positionMs: 30_000,
			paused: false,
			uri: A,
			linkedFromUri: null,
		});

		await f.clock.sleep(1000);
		expect((await f.transport.getState())?.positionMs).toBe(31_000);
	});

	it("freezes the position on pause and restarts it after the latency on resume", async () => {
		const f = createFakeTransport({ latencyMs: 100 });
		await f.transport.playFrom(A, 0);
		await f.clock.sleep(600);
		await f.transport.pause();
		const paused = await f.transport.getState();
		expect(paused).toMatchObject({ paused: true, uri: A, positionMs: 500 });

		await f.clock.sleep(1000);
		expect((await f.transport.getState())?.positionMs).toBe(500);

		await f.transport.resume();
		await f.clock.sleep(99);
		expect((await f.transport.getState())?.positionMs).toBe(500);
		await f.clock.sleep(51);
		expect((await f.transport.getState())?.positionMs).toBe(550);
	});

	it("keeps a playing track playing across a seek", async () => {
		const f = createFakeTransport({ latencyMs: 0 });
		await f.transport.playFrom(A, 0);
		await f.clock.sleep(100);
		await f.transport.seek(40_000);
		await f.clock.sleep(250);
		expect(await f.transport.getState()).toMatchObject({
			paused: false,
			positionMs: 40_250,
		});
	});

	it("reports a relinked track under the new uri, with the requested one as linkedFromUri", async () => {
		const f = createFakeTransport({
			latencyMs: 0,
			relinkedTo: "spotify:track:relinked",
		});
		await f.transport.playFrom(A, 0);
		await f.clock.sleep(10);
		expect(await f.transport.getState()).toMatchObject({
			uri: "spotify:track:relinked",
			linkedFromUri: A,
		});
	});
});

describe("quirks", () => {
	it("ignores SDK pause but honours pauseViaApi", async () => {
		const f = createFakeTransport({ latencyMs: 0, sdkPauseIgnored: true });
		await f.transport.playFrom(A, 0);
		await f.clock.sleep(100);

		await f.transport.pause();
		expect((await f.transport.getState())?.paused).toBe(false);

		await f.transport.pauseViaApi();
		expect((await f.transport.getState())?.paused).toBe(true);
	});

	it("ignores SDK seek but honours seekViaApi", async () => {
		const f = createFakeTransport({ latencyMs: 0, sdkSeekIgnored: true });
		await f.transport.playFrom(A, 5000);
		await f.transport.pauseViaApi();

		await f.transport.seek(20_000);
		expect((await f.transport.getState())?.positionMs).toBe(5000);

		await f.transport.seekViaApi(20_000);
		expect((await f.transport.getState())?.positionMs).toBe(20_000);
	});

	it("rejects the first N playFrom calls with device-gone, then plays after connect", async () => {
		const f = createFakeTransport({ latencyMs: 0, play404Times: 2 });

		for (let i = 0; i < 2; i++) {
			const error = await f.transport.playFrom(A, 0).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(TransportError);
			expect((error as TransportError).kind).toBe("device-gone");
			await f.transport.connect({ volume: 1 });
		}
		await expect(f.transport.playFrom(A, 0)).resolves.toBeUndefined();
		expect(f.calls).toEqual([
			`playFrom ${A} 0`,
			"connect",
			`playFrom ${A} 0`,
			"connect",
			`playFrom ${A} 0`,
		]);
	});

	it("ignores SDK setVolume when asked to, and takes it otherwise", async () => {
		const ignoring = createFakeTransport({
			latencyMs: 0,
			setVolumeIgnored: true,
		});
		await ignoring.transport.connect({ volume: 0.5 });
		await ignoring.transport.setVolume(0);
		expect(await ignoring.transport.getVolume()).toBe(0.5);
		expect(ignoring.volume()).toBe(0.5);

		const working = createFakeTransport({ latencyMs: 0 });
		await working.transport.setVolume(0.2);
		expect(await working.transport.getVolume()).toBe(0.2);
	});
});

describe("audibleMs", () => {
	it("counts only time where audio is playing and the volume is above zero", async () => {
		const f = createFakeTransport({ latencyMs: 100 });
		await f.clock.sleep(1000); // nothing playing
		expect(f.audibleMs()).toBe(0);

		await f.transport.playFrom(A, 0); // 5ms call, audio from t = 1105
		await f.clock.sleep(1000); // 105ms of call and latency, then 900 audible
		expect(f.audibleMs()).toBe(900);

		await f.transport.setVolume(0);
		await f.clock.sleep(500); // muted
		expect(f.audibleMs()).toBe(900);

		await f.transport.setVolume(1);
		await f.clock.sleep(200);
		await f.transport.pause();
		await f.clock.sleep(700); // paused
		expect(f.audibleMs()).toBe(1100);
		expect(f.calls).toEqual([
			`playFrom ${A} 0`,
			"setVolume 0",
			"setVolume 1",
			"pause",
		]);
	});
});
