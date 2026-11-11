import { describe, expect, it } from "vitest";
import {
	type CueTarget,
	type PlaybackAdapter,
	PlaybackError,
	type PlaybackStatus,
} from "./adapter";
import { createPlaybackAdapter } from "./engine";
import {
	createFakeTransport,
	type FakeTransportOptions,
} from "./fakeTransport";
import { type PlayerTransport, TransportError } from "./transport";

const A: CueTarget = { uri: "spotify:track:a", startMs: 30_000 };
const B: CueTarget = { uri: "spotify:track:b", startMs: 10_000 };
const OTHER = "spotify:track:other";
const USER_VOLUME = 0.6;

function setup(
	options: FakeTransportOptions = { latencyMs: 20 },
	wrap: (transport: PlayerTransport) => PlayerTransport = (t) => t,
) {
	const f = createFakeTransport(options);
	let hidden = false;
	const listeners = new Set<(hidden: boolean) => void>();
	const visibility = {
		isHidden: () => hidden,
		subscribe(listener: (hidden: boolean) => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set(next: boolean) {
			hidden = next;
			for (const listener of [...listeners]) listener(next);
		},
		listenerCount: () => listeners.size,
	};
	const adapter = createPlaybackAdapter({
		transport: wrap(f.transport),
		clock: f.clock,
		visibility,
	});
	const statuses: string[] = [];
	adapter.onStatus((status) => statuses.push(status.kind));
	return { f, adapter, visibility, statuses };
}

async function readyAt(
	target: CueTarget = A,
	options?: FakeTransportOptions,
	wrap?: (transport: PlayerTransport) => PlayerTransport,
) {
	const s = setup(options, wrap);
	await s.adapter.connect({ volume: USER_VOLUME });
	await s.adapter.cue(target);
	s.statuses.length = 0;
	return s;
}

async function flush(times = 10) {
	for (let i = 0; i < times; i++) await Promise.resolve();
}

function until(adapter: PlaybackAdapter, kind: PlaybackStatus["kind"]) {
	return new Promise<void>((resolve) => {
		if (adapter.getStatus().kind === kind) return resolve();
		const off = adapter.onStatus((status) => {
			if (status.kind !== kind) return;
			off();
			resolve();
		});
	});
}

const count = (calls: readonly string[], call: string) =>
	calls.filter((c) => c === call).length;

const foreignState = {
	type: "state",
	state: {
		uri: OTHER,
		positionMs: 5,
		paused: false,
		linkedFromUri: null,
	},
} as const;

async function rejection(promise: Promise<unknown>) {
	return promise.then(
		() => null,
		(error: unknown) => error,
	);
}

describe("connect", () => {
	it("goes disconnected -> connecting -> idle", async () => {
		const { adapter, statuses } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		expect(statuses).toEqual(["connecting", "idle"]);
		expect(adapter.getStatus()).toEqual({ kind: "idle" });
	});

	it("is idempotent: no second transport.connect while connecting or connected", async () => {
		const { f, adapter } = setup();
		const first = adapter.connect({ volume: USER_VOLUME });
		const second = adapter.connect({ volume: USER_VOLUME });
		await Promise.all([first, second]);
		await adapter.connect({ volume: USER_VOLUME });
		expect(count(f.calls, "connect")).toBe(1);
	});

	it("stays disconnected and rejects with the same PlaybackError on failure", async () => {
		const failure = new PlaybackError("authentication", "no token");
		const { adapter, statuses } = setup(undefined, (t) => ({
			...t,
			connect: async () => {
				throw failure;
			},
		}));
		await expect(adapter.connect({ volume: 1 })).rejects.toBe(failure);
		expect(adapter.getStatus()).toEqual({ kind: "disconnected" });
		expect(statuses).toEqual(["connecting", "disconnected"]);
	});

	it.each([
		["device-gone", "device-lost"],
		["request-failed", "initialization"],
		["not-connected", "initialization"],
	] as const)(
		"maps a TransportError(%s) from connect to %s",
		async (kind, mapped) => {
			const { adapter } = setup(undefined, (t) => ({
				...t,
				connect: async () => {
					throw new TransportError(kind, "transfer failed");
				},
			}));
			const error = await rejection(adapter.connect({ volume: 1 }));
			expect(error).toBeInstanceOf(PlaybackError);
			expect((error as PlaybackError).kind).toBe(mapped);
			expect(adapter.getStatus().kind).toBe("disconnected");
		},
	);

	it("rejects not-connected for everything before connect resolves", async () => {
		const { adapter } = setup();
		for (const call of [
			() => adapter.cue(A),
			() => adapter.playClip(1000),
			() => adapter.reveal(),
		]) {
			const error = await rejection(call());
			expect((error as PlaybackError).kind).toBe("not-connected");
		}
	});

	it("rejects not-connected for playClip when nothing is cued", async () => {
		const { adapter } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		const error = await rejection(adapter.playClip(1000));
		expect((error as PlaybackError).kind).toBe("not-connected");
	});
});

describe("cue", () => {
	it("goes idle -> cueing -> ready, silent throughout, volume restored", async () => {
		const { f, adapter, statuses } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		statuses.length = 0;

		await adapter.cue(A);

		expect(statuses).toEqual(["cueing", "ready"]);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
		expect(f.audibleMs()).toBe(0);
		expect(f.volume()).toBe(USER_VOLUME);
		expect(f.calls.indexOf("setVolume 0")).toBeLessThan(
			f.calls.findIndex((c) => c.startsWith("playFrom")),
		);
	});

	it("works when the SDK ignores pause and seek (Web API fallback)", async () => {
		const { f, adapter } = setup({
			latencyMs: 20,
			sdkPauseIgnored: true,
			sdkSeekIgnored: true,
		});
		await adapter.connect({ volume: USER_VOLUME });
		await adapter.cue(A);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
		expect(f.calls).toContain("pauseViaApi");
		expect(f.calls).toContain("seekViaApi 30000");
		expect(f.audibleMs()).toBe(0);
	});

	it("works end to end with a relinked track", async () => {
		const { f, adapter } = await readyAt(A, {
			latencyMs: 20,
			relinkedTo: "spotify:track:relinked",
		});
		f.emit({
			type: "state",
			state: {
				uri: "spotify:track:relinked",
				linkedFromUri: A.uri,
				positionMs: 30_000,
				paused: true,
			},
		});
		expect(adapter.getStatus().kind).toBe("ready");
		expect(await adapter.playClip(500)).toEqual({ kind: "ended" });
		await until(adapter, "ready");
		expect(f.audibleMs()).toBeGreaterThanOrEqual(500);
	});

	it("recovers a 404 once inside the cue by reconnecting", async () => {
		const { f, adapter } = setup({ latencyMs: 20, play404Times: 1 });
		await adapter.connect({ volume: USER_VOLUME });
		await adapter.cue(A);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
		expect(count(f.calls, "connect")).toBe(2);
		expect(f.volume()).toBe(USER_VOLUME);
		expect(f.audibleMs()).toBe(0);
	});

	it("rejects device-lost when the retry 404s too, leaving the status interrupted", async () => {
		const { f, adapter } = setup({ latencyMs: 20, play404Times: 2 });
		await adapter.connect({ volume: USER_VOLUME });
		const error = await rejection(adapter.cue(A));
		expect((error as PlaybackError).kind).toBe("device-lost");
		expect(count(f.calls, "connect")).toBe(2);
		expect(adapter.getStatus()).toEqual({
			kind: "interrupted",
			reason: "device-lost",
			target: A,
		});
		expect(f.volume()).toBe(USER_VOLUME);
	});

	it("restores the volume, goes idle and rejects cue-failed when the cue times out", async () => {
		const { f, adapter } = setup({ latencyMs: 600_000 });
		await adapter.connect({ volume: USER_VOLUME });
		const error = await rejection(adapter.cue(A));
		expect(error).toBeInstanceOf(PlaybackError);
		expect((error as PlaybackError).kind).toBe("cue-failed");
		expect((error as PlaybackError).message).toContain("timeout");
		expect(adapter.getStatus()).toEqual({ kind: "idle" });
		expect(f.volume()).toBe(USER_VOLUME);
		expect(f.audibleMs()).toBe(0);
	});

	it("fails the cue with the message of a playback error event", async () => {
		const { f, adapter } = setup({ latencyMs: 100 });
		await adapter.connect({ volume: USER_VOLUME });
		f.schedule(f.clock.now() + 30, () =>
			f.emit({ type: "error", kind: "playback", message: "boom" }),
		);
		const error = await rejection(adapter.cue(A));
		expect((error as PlaybackError).kind).toBe("cue-failed");
		expect((error as PlaybackError).message).toContain("boom");
		expect(adapter.getStatus().kind).toBe("idle");
	});

	it("is not interrupted by not-ready or foreign state mid-cue", async () => {
		const { f, adapter, statuses } = setup({ latencyMs: 100 });
		await adapter.connect({ volume: USER_VOLUME });
		statuses.length = 0;
		const now = f.clock.now();
		f.schedule(now + 20, () => f.emit({ type: "not-ready" }));
		f.schedule(now + 40, () => f.emit(foreignState));
		f.schedule(now + 60, () => f.emit({ type: "state", state: null }));

		await adapter.cue(A);

		expect(statuses).toEqual(["cueing", "ready"]);
	});

	it("rejects an older cue with superseded and leaves the newer one ready", async () => {
		const { f, adapter } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		const older = rejection(adapter.cue(A));
		await flush();
		const newer = adapter.cue(B);

		expect(((await older) as PlaybackError).kind).toBe("superseded");
		await newer;

		expect(adapter.getStatus()).toEqual({ kind: "ready", target: B });
		expect(f.volume()).toBe(USER_VOLUME);
		expect(f.audibleMs()).toBe(0);
		expect((await f.transport.getState())?.paused).toBe(true);
	});

	it("rejects a cue superseded before it started without touching the transport", async () => {
		const { f, adapter } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		const older = rejection(adapter.cue(A));
		const newer = adapter.cue(B);
		expect(((await older) as PlaybackError).kind).toBe("superseded");
		await newer;
		expect(f.calls.filter((c) => c.startsWith("playFrom"))).toEqual([
			`playFrom ${B.uri} ${B.startMs}`,
		]);
	});

	it("ends a playing clip as stopped and cues the new target", async () => {
		const { f, adapter } = await readyAt();
		const t0 = f.clock.now();
		let cueing: Promise<void> | null = null;
		f.schedule(t0 + 300, () => {
			cueing = adapter.cue(B);
		});

		const outcome = await adapter.playClip(5000);
		await cueing;

		expect(outcome).toEqual({ kind: "stopped" });
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: B });
		expect((await f.transport.getState())?.paused).toBe(true);
		expect(f.clock.now()).toBeLessThan(t0 + 2000);
	});

	it("cancels a clip requested against the previous cue", async () => {
		const { adapter } = await readyAt();
		const first = adapter.cue(B);
		const queued = adapter.playClip(500);
		const second = adapter.cue(A);
		await first.catch(() => {});
		await second;
		expect(await queued).toEqual({ kind: "stopped" });
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
	});
});

describe("playClip", () => {
	it("settles ended, re-cues by seek and replays from the same start point", async () => {
		const { f, adapter, statuses } = await readyAt();

		const outcome = await adapter.playClip(1000);
		await until(adapter, "ready");

		expect(outcome).toEqual({ kind: "ended" });
		expect(statuses).toEqual(["playing-clip", "cueing", "ready"]);
		expect(f.calls).toContain("seek 30000");
		const second = await adapter.playClip(1000);
		await until(adapter, "ready");
		expect(second).toEqual({ kind: "ended" });
		expect(f.calls.filter((c) => c.startsWith("playFrom"))).toHaveLength(1);
		expect(count(f.calls, "resume")).toBe(2);
		expect(f.audibleMs()).toBeGreaterThanOrEqual(2000);
	});

	it("settles the clip before the re-cue starts", async () => {
		const { adapter } = await readyAt();
		let atSettle: PlaybackStatus["kind"] | null = null;
		await adapter.playClip(500).then(() => {
			atSettle = adapter.getStatus().kind;
		});
		expect(atSettle).toBe("playing-clip");
		await until(adapter, "ready");
	});

	it("waits for the re-cue and then runs once", async () => {
		const { f, adapter } = await readyAt();
		await adapter.playClip(500);
		const queued = adapter.playClip(500);

		expect(await queued).toEqual({ kind: "ended" });

		await until(adapter, "ready");
		expect(count(f.calls, "resume")).toBe(2);
	});

	it("settles a queued play as hidden when the tab was hidden during the re-cue", async () => {
		const { f, adapter, visibility } = await readyAt();
		await adapter.playClip(500);
		const queued = adapter.playClip(500);
		visibility.set(true);

		expect(await queued).toEqual({ kind: "hidden" });

		await until(adapter, "ready");
		expect(count(f.calls, "resume")).toBe(1);
		expect(adapter.getStatus().kind).toBe("ready");
	});

	it("returns the same promise for a second playClip while one is pending or playing", async () => {
		const { f, adapter } = await readyAt();
		const playing = adapter.playClip(800);
		expect(adapter.playClip(800)).toBe(playing);
		await playing;
		const pending = adapter.playClip(800);
		expect(adapter.playClip(300)).toBe(pending);
		await pending;
		await until(adapter, "ready");
		expect(count(f.calls, "resume")).toBe(2);
	});

	it("rejects device-lost when interrupted", async () => {
		const { f, adapter } = await readyAt();
		f.emit({ type: "not-ready" });
		const error = await rejection(adapter.playClip(500));
		expect((error as PlaybackError).kind).toBe("device-lost");
	});

	it("settles hidden at the event time, without waiting for the poll loop", async () => {
		const { f, adapter, visibility } = await readyAt();
		const t0 = f.clock.now();
		let pausesAtHidden = -1;
		f.schedule(t0 + 500, () => {
			pausesAtHidden = f.calls.length;
			visibility.set(true);
		});

		const outcome = await adapter.playClip(10_000);

		expect(outcome).toEqual({ kind: "hidden" });
		expect(f.calls[pausesAtHidden]).toBe("pause");
		expect(f.clock.now()).toBeLessThan(t0 + 600);
		expect(f.audibleMs()).toBeLessThan(600);
		await until(adapter, "ready");
		expect(f.calls.at(-1)).toMatch(/^seek /);
	});

	it("ignores hidden while ready", async () => {
		const { f, adapter, visibility } = await readyAt();
		const before = f.calls.length;
		visibility.set(true);
		expect(f.calls).toHaveLength(before);
		expect(adapter.getStatus().kind).toBe("ready");
	});

	it("stops listening to visibility after disconnect", async () => {
		const { adapter, visibility } = await readyAt();
		expect(visibility.listenerCount()).toBe(1);
		adapter.disconnect();
		expect(visibility.listenerCount()).toBe(0);
	});
});

describe("reveal", () => {
	it("settles a running clip as revealed with no pause and no seek afterwards", async () => {
		const { f, adapter } = await readyAt();
		const t0 = f.clock.now();
		let mark = -1;
		f.schedule(t0 + 300, () => {
			mark = f.calls.length;
			void adapter.reveal();
		});

		const outcome = await adapter.playClip(10_000);

		expect(outcome).toEqual({ kind: "revealed" });
		expect(adapter.getStatus()).toEqual({ kind: "revealing", target: A });
		const after = f.calls.slice(mark);
		expect(after).not.toContain("pause");
		expect(after.some((c) => c.startsWith("seek"))).toBe(false);
		expect(after).not.toContain("resume");
		expect((await f.transport.getState())?.paused).toBe(false);
	});

	it("plays from the start point when ready and resolves once audible", async () => {
		const { f, adapter } = await readyAt();

		await adapter.reveal();

		expect(adapter.getStatus()).toEqual({ kind: "revealing", target: A });
		expect(f.calls.at(-1)).toBe("resume");
		const state = await f.transport.getState();
		expect(state?.paused).toBe(false);
		expect(state?.positionMs).toBeGreaterThan(A.startMs);
		expect(state?.positionMs).toBeLessThan(A.startMs + 200);
	});

	it("is a no-op for hidden", async () => {
		const { f, adapter, visibility } = await readyAt();
		await adapter.reveal();
		const before = f.calls.length;
		visibility.set(true);
		await f.clock.sleep(100);
		expect(f.calls).toHaveLength(before);
		expect(adapter.getStatus().kind).toBe("revealing");
	});

	it("is ended by stop: confirmed pause, then a seek back to the start", async () => {
		const { f, adapter, statuses } = await readyAt();
		await adapter.reveal();
		statuses.length = 0;
		const mark = f.calls.length;

		await adapter.stop();

		expect(statuses).toEqual(["cueing", "ready"]);
		const after = f.calls.slice(mark);
		expect(after[0]).toBe("pause");
		expect(after.at(-1)).toBe("seek 30000");
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
	});

	it("is ended by a new cue", async () => {
		const { f, adapter } = await readyAt();
		await adapter.reveal();
		await adapter.cue(B);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: B });
		expect((await f.transport.getState())?.paused).toBe(true);
	});

	it("waits for the re-cue when called while cueing (pending slot)", async () => {
		const { f, adapter } = await readyAt();
		await adapter.playClip(500);
		const revealed = adapter.reveal();
		await revealed;
		expect(adapter.getStatus().kind).toBe("revealing");
		expect(count(f.calls, "resume")).toBe(2);
	});

	it("pins the slot rule: a playClip behind a pending reveal resolves revealed", async () => {
		const { f, adapter } = await readyAt();
		await adapter.playClip(500);
		const reveal = adapter.reveal();
		expect(await adapter.playClip(500)).toEqual({ kind: "revealed" });
		await reveal;
		expect(count(f.calls, "resume")).toBe(2);
	});

	it("pins the slot rule: a reveal behind a pending play is a no-op", async () => {
		const { f, adapter } = await readyAt();
		await adapter.playClip(500);
		const play = adapter.playClip(500);
		await adapter.reveal();
		expect(await play).toEqual({ kind: "ended" });
		await until(adapter, "ready");
		expect(count(f.calls, "resume")).toBe(2);
	});
});

describe("stop", () => {
	it("settles a running clip as stopped, pauses and re-cues", async () => {
		const { f, adapter } = await readyAt();
		const t0 = f.clock.now();
		let stopping: Promise<void> | null = null;
		f.schedule(t0 + 300, () => {
			stopping = adapter.stop();
		});

		const outcome = await adapter.playClip(10_000);
		await stopping;

		expect(outcome).toEqual({ kind: "stopped" });
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
		expect(f.calls.at(-1)).toBe("seek 30000");
		expect((await f.transport.getState())?.paused).toBe(true);
	});

	it("does nothing when ready, idle or disconnected", async () => {
		const { f, adapter } = setup();
		await adapter.stop();
		await adapter.connect({ volume: USER_VOLUME });
		await adapter.stop();
		await adapter.cue(A);
		const before = f.calls.length;
		await adapter.stop();
		expect(f.calls).toHaveLength(before);
		expect(adapter.getStatus().kind).toBe("ready");
	});
});

describe("interruption", () => {
	it.each([
		["not-ready", { type: "not-ready" }, "device-lost"],
		["a foreign track", foreignState, "taken-over"],
		["a null state", { type: "state", state: null }, "taken-over"],
	] as const)("%s while ready interrupts", async (_name, event, reason) => {
		const { f, adapter } = await readyAt();
		f.emit(event);
		expect(adapter.getStatus()).toEqual({
			kind: "interrupted",
			reason,
			target: A,
		});
	});

	it("ignores events about our own track", async () => {
		const { f, adapter } = await readyAt();
		f.emit({
			type: "state",
			state: { uri: A.uri, positionMs: 1, paused: true, linkedFromUri: null },
		});
		f.emit({ type: "error", kind: "playback", message: "unrelated" });
		expect(adapter.getStatus().kind).toBe("ready");
	});

	it.each([
		["not-ready", { type: "not-ready" }, "device-lost"],
		["a foreign track", foreignState, "taken-over"],
	] as const)(
		"%s mid-clip settles the clip interrupted",
		async (_name, event, reason) => {
			const { f, adapter } = await readyAt();
			f.schedule(f.clock.now() + 300, () => f.emit(event));

			const outcome = await adapter.playClip(10_000);

			expect(outcome).toEqual({ kind: "interrupted", reason });
			expect(adapter.getStatus()).toEqual({
				kind: "interrupted",
				reason,
				target: A,
			});
		},
	);

	it("detects a stalled clip by timeout, not by an event", async () => {
		const { adapter } = await readyAt(A, undefined, (t) => ({
			...t,
			resume: async () => {},
		}));

		const outcome = await adapter.playClip(1000);

		expect(outcome).toEqual({ kind: "interrupted", reason: "device-lost" });
		expect(adapter.getStatus()).toEqual({
			kind: "interrupted",
			reason: "device-lost",
			target: A,
		});
	});

	it("classifies a timeout on a foreign track as taken-over", async () => {
		let foreign = false;
		const { f, adapter } = await readyAt(A, undefined, (t) => ({
			...t,
			resume: async () => {},
			getState: async () => {
				const state = await t.getState();
				return foreign && state
					? { ...state, uri: OTHER, linkedFromUri: null }
					: state;
			},
		}));
		foreign = true;
		const outcome = await adapter.playClip(1000);
		expect(outcome).toEqual({ kind: "interrupted", reason: "taken-over" });
		expect(f.audibleMs()).toBe(0);
	});

	it("interrupts a reveal and rejects it when the device is lost", async () => {
		const { f, adapter } = await readyAt();
		f.schedule(f.clock.now() + 8, () => f.emit({ type: "not-ready" }));
		const error = await rejection(adapter.reveal());
		expect((error as PlaybackError).kind).toBe("device-lost");
		expect(adapter.getStatus().kind).toBe("interrupted");
	});
});

describe("disconnect", () => {
	it("settles a running clip as interrupted and ends disconnected", async () => {
		const { f, adapter } = await readyAt();
		f.schedule(f.clock.now() + 300, () => adapter.disconnect());

		const outcome = await adapter.playClip(10_000);

		expect(outcome).toEqual({ kind: "interrupted", reason: "device-lost" });
		expect(adapter.getStatus()).toEqual({ kind: "disconnected" });
		expect(f.calls).toContain("disconnect");
	});

	it("rejects a running cue superseded and a pending clip not-connected", async () => {
		const { f, adapter } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		const cue = rejection(adapter.cue(A));
		const clip = rejection(adapter.playClip(500));
		await flush();

		adapter.disconnect();

		expect(((await cue) as PlaybackError).kind).toBe("superseded");
		expect(((await clip) as PlaybackError).kind).toBe("not-connected");
		expect(adapter.getStatus()).toEqual({ kind: "disconnected" });
		expect(f.volume()).toBe(USER_VOLUME);
	});
});

describe("recover", () => {
	it("reconnects after the device was lost, transfers, re-cues and ends ready", async () => {
		const { f, adapter, statuses } = await readyAt();
		f.emit({ type: "not-ready" });
		statuses.length = 0;
		const mark = f.calls.length;

		await adapter.recover();

		const after = f.calls.slice(mark);
		expect(after[0]).toBe("connect");
		expect(after[1]).toBe("transferHere");
		expect(after.some((c) => c.startsWith("playFrom"))).toBe(true);
		expect(statuses).toEqual(["connecting", "cueing", "ready"]);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
		expect(f.audibleMs()).toBe(0);
	});

	it("transfers and re-cues without reconnecting after a take-over", async () => {
		const { f, adapter } = await readyAt();
		f.emit(foreignState);
		const mark = f.calls.length;

		await adapter.recover();

		const after = f.calls.slice(mark);
		expect(after).not.toContain("connect");
		expect(after[0]).toBe("transferHere");
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
	});

	it("recovers after an interruption mid-clip", async () => {
		const { f, adapter } = await readyAt();
		f.schedule(f.clock.now() + 300, () => f.emit(foreignState));
		await adapter.playClip(10_000);

		await adapter.recover();

		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
		expect(await adapter.playClip(300)).toEqual({ kind: "ended" });
	});

	it("reconnects from disconnected and ends ready when a target was cued", async () => {
		const { f, adapter } = await readyAt();
		adapter.disconnect();
		await adapter.recover();
		expect(count(f.calls, "connect")).toBe(2);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: A });
	});

	it("ends idle when no target was ever cued", async () => {
		const { f, adapter } = setup();
		await adapter.connect({ volume: USER_VOLUME });
		adapter.disconnect();
		await adapter.recover();
		expect(adapter.getStatus()).toEqual({ kind: "idle" });
		expect(f.calls).toContain("transferHere");
	});

	it("is a no-op when nothing is interrupted", async () => {
		const { f, adapter } = await readyAt();
		const before = f.calls.length;
		await adapter.recover();
		expect(f.calls).toHaveLength(before);
	});

	it("returns to the interrupted status when the reconnect fails", async () => {
		let failing = false;
		const { f, adapter } = await readyAt(A, undefined, (t) => ({
			...t,
			connect: async (options) => {
				if (failing) throw new PlaybackError("initialization", "offline");
				return t.connect(options);
			},
		}));
		f.emit({ type: "not-ready" });
		failing = true;
		const error = await rejection(adapter.recover());
		expect((error as PlaybackError).kind).toBe("initialization");
		expect(adapter.getStatus()).toEqual({
			kind: "interrupted",
			reason: "device-lost",
			target: A,
		});
	});
});

describe("setVolume", () => {
	it("clamps to 0-1 and applies it", async () => {
		const { f, adapter } = await readyAt();
		await adapter.setVolume(5);
		expect(f.volume()).toBe(1);
		await adapter.setVolume(-3);
		expect(f.volume()).toBe(0);
	});

	it("is remembered by the next cue's restore", async () => {
		const { f, adapter } = await readyAt();
		await adapter.setVolume(0.4);
		await adapter.cue(B);
		expect(f.volume()).toBe(0.4);
		expect(f.calls.at(-1)).toBe("setVolume 0.4");
	});

	it("called during a cue only takes effect at the restore", async () => {
		const { f, adapter } = setup({ latencyMs: 100 });
		await adapter.connect({ volume: USER_VOLUME });
		const cue = adapter.cue(A);
		await flush(6);
		expect(f.calls).toContain("setVolume 0");

		await adapter.setVolume(0.3);
		expect(f.calls).not.toContain("setVolume 0.3");
		await cue;

		expect(f.volume()).toBe(0.3);
		expect(f.calls.at(-1)).toBe("setVolume 0.3");
		expect(f.audibleMs()).toBe(0);
	});

	it("swallows a transport rejection and still remembers the value", async () => {
		let failing = false;
		const { f, adapter } = await readyAt(A, undefined, (t) => ({
			...t,
			setVolume: async (volume) => {
				if (failing) throw new TransportError("request-failed", "nope");
				return t.setVolume(volume);
			},
		}));
		failing = true;
		await expect(adapter.setVolume(0.2)).resolves.toBeUndefined();
		failing = false;
		await adapter.cue(B);
		expect(f.volume()).toBe(0.2);
	});
});

describe("onStatus", () => {
	it("skips the initial status, emits changes and stops after unsubscribe", async () => {
		const { adapter } = setup();
		const seen: string[] = [];
		const off = adapter.onStatus((status) => seen.push(status.kind));
		await adapter.connect({ volume: USER_VOLUME });
		off();
		await adapter.cue(A);
		expect(seen).toEqual(["connecting", "idle"]);
		expect(adapter.getStatus().kind).toBe("ready");
	});
});
