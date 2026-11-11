import { describe, expect, it } from "vitest";
import {
	type ClipOutcome,
	type CueTarget,
	type PlaybackAdapter,
	PlaybackError,
	type PlaybackStatus,
} from "./adapter";
import { createFakeAdapter } from "./fakeAdapter";

const target: CueTarget = { uri: "spotify:track:a", startMs: 1000 };
const other: CueTarget = { uri: "spotify:track:b", startMs: 2000 };

async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function ready(options?: { autoEndClips?: boolean }) {
	const adapter = createFakeAdapter(options);
	await adapter.connect({ volume: 0.5 });
	await adapter.cue(target);
	return adapter;
}

function kinds(adapter: PlaybackAdapter) {
	const seen: string[] = [];
	adapter.onStatus((status) => seen.push(status.kind));
	return seen;
}

describe("createFakeAdapter", () => {
	it("satisfies PlaybackAdapter", () => {
		const adapter: PlaybackAdapter = createFakeAdapter();
		expect(adapter.getStatus()).toEqual({ kind: "disconnected" });
	});

	it("connects through connecting to idle", async () => {
		const adapter = createFakeAdapter();
		const seen = kinds(adapter);
		await adapter.connect({ volume: 0.5 });
		expect(seen).toEqual(["connecting", "idle"]);
		expect(adapter.getStatus()).toEqual({ kind: "idle" });
	});

	it("cues through cueing to ready", async () => {
		const adapter = createFakeAdapter();
		await adapter.connect({ volume: 0.5 });
		const seen = kinds(adapter);
		await adapter.cue(target);
		expect(seen).toEqual(["cueing", "ready"]);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target });
	});

	it("stops notifying after unsubscribe", async () => {
		const adapter = createFakeAdapter();
		const seen: PlaybackStatus[] = [];
		const unsubscribe = adapter.onStatus((status) => seen.push(status));
		unsubscribe();
		await adapter.connect({ volume: 0.5 });
		expect(seen).toEqual([]);
	});

	it("failNextCue rejects the next cue once and leaves the adapter idle", async () => {
		const adapter = await ready();
		const error = new PlaybackError("cue-failed", "nope");
		adapter.failNextCue(error);
		await expect(adapter.cue(other)).rejects.toBe(error);
		expect(adapter.getStatus()).toEqual({ kind: "idle" });
		await adapter.cue(other);
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: other });
	});

	it("newer cue wins and the older rejects as superseded", async () => {
		const adapter = await ready();
		const older = adapter.cue(target);
		const newer = adapter.cue(other);
		await expect(older).rejects.toMatchObject({ kind: "superseded" });
		await newer;
		expect(adapter.getStatus()).toEqual({ kind: "ready", target: other });
	});

	describe("playClip", () => {
		it("settles with ended on endClip, then re-cues to ready", async () => {
			const adapter = await ready();
			const seen = kinds(adapter);
			const clip = adapter.playClip(500);
			expect(adapter.getStatus()).toEqual({ kind: "playing-clip", target });
			adapter.endClip();
			await expect(clip).resolves.toEqual({ kind: "ended" });
			await flush();
			expect(seen).toEqual(["playing-clip", "cueing", "ready"]);
			expect(adapter.getStatus()).toEqual({ kind: "ready", target });
		});

		it("settles before the re-cue starts", async () => {
			const adapter = await ready();
			const seen: string[] = [];
			adapter.onStatus((status) => seen.push(status.kind));
			const clip = adapter.playClip(500).then(() => seen.push("settled"));
			adapter.endClip();
			await clip;
			await flush();
			expect(seen).toEqual(["playing-clip", "settled", "cueing", "ready"]);
		});

		it("settles with hidden on hideTab, then re-cues", async () => {
			const adapter = await ready();
			const clip = adapter.playClip(500);
			adapter.hideTab();
			await expect(clip).resolves.toEqual({ kind: "hidden" });
			await flush();
			expect(adapter.getStatus()).toEqual({ kind: "ready", target });
		});

		it("settles with interrupted and does not re-cue", async () => {
			const adapter = await ready();
			const clip = adapter.playClip(500);
			adapter.interrupt("taken-over");
			await expect(clip).resolves.toEqual({
				kind: "interrupted",
				reason: "taken-over",
			});
			await flush();
			expect(adapter.getStatus()).toEqual({
				kind: "interrupted",
				reason: "taken-over",
				target,
			});
		});

		it("rejects with not-connected before connect and while idle", async () => {
			const adapter = createFakeAdapter();
			await expect(adapter.playClip(500)).rejects.toMatchObject({
				kind: "not-connected",
			});
			await adapter.connect({ volume: 0.5 });
			await expect(adapter.playClip(500)).rejects.toMatchObject({
				kind: "not-connected",
			});
		});

		it("rejects with device-lost while interrupted", async () => {
			const adapter = await ready();
			adapter.interrupt("device-lost");
			await expect(adapter.playClip(500)).rejects.toMatchObject({
				kind: "device-lost",
			});
		});

		it("waits for a re-cue in flight and then plays once", async () => {
			const adapter = await ready();
			const seen = kinds(adapter);
			const first = adapter.playClip(500);
			adapter.endClip();
			await first;
			const queued = adapter.playClip(500);
			expect(adapter.playClip(500)).toBe(queued);
			expect(adapter.getStatus().kind).toBe("cueing");
			await flush();
			expect(adapter.getStatus()).toEqual({ kind: "playing-clip", target });
			adapter.endClip();
			await expect(queued).resolves.toEqual({ kind: "ended" });
			expect(seen.filter((kind) => kind === "playing-clip")).toHaveLength(2);
		});

		it("rejects a play queued during a cue that fails", async () => {
			const adapter = createFakeAdapter();
			await adapter.connect({ volume: 0.5 });
			adapter.failNextCue(new PlaybackError("cue-failed", "no"));
			const cue = adapter.cue(target).catch(() => undefined);
			const queued = adapter.playClip(500);
			await cue;
			await expect(queued).rejects.toMatchObject({ kind: "not-connected" });
		});

		it("returns the same pending promise while a clip plays", async () => {
			const adapter = await ready();
			const first = adapter.playClip(500);
			const second = adapter.playClip(900);
			expect(second).toBe(first);
			adapter.endClip();
			await expect(first).resolves.toEqual({ kind: "ended" });
		});

		it("ends on the next microtask with autoEndClips", async () => {
			const adapter = await ready({ autoEndClips: true });
			await expect(adapter.playClip(500)).resolves.toEqual({ kind: "ended" });
			await flush();
			expect(adapter.getStatus()).toEqual({ kind: "ready", target });
		});
	});

	describe("reveal", () => {
		it("settles a pending clip with revealed and goes to revealing", async () => {
			const adapter = await ready();
			const clip = adapter.playClip(500);
			await adapter.reveal();
			await expect(clip).resolves.toEqual({ kind: "revealed" });
			await flush();
			expect(adapter.getStatus()).toEqual({ kind: "revealing", target });
		});

		it("goes to revealing from ready", async () => {
			const adapter = await ready();
			await adapter.reveal();
			expect(adapter.getStatus()).toEqual({ kind: "revealing", target });
		});
	});

	describe("stop", () => {
		it("settles a clip with stopped and re-cues", async () => {
			const adapter = await ready();
			const clip: Promise<ClipOutcome> = adapter.playClip(500);
			await adapter.stop();
			await expect(clip).resolves.toEqual({ kind: "stopped" });
			expect(adapter.getStatus()).toEqual({ kind: "ready", target });
		});

		it("re-cues after a reveal", async () => {
			const adapter = await ready();
			await adapter.reveal();
			await adapter.stop();
			expect(adapter.getStatus()).toEqual({ kind: "ready", target });
		});

		it("is a no-op when idle or ready", async () => {
			const adapter = createFakeAdapter();
			await adapter.connect({ volume: 0.5 });
			const seen = kinds(adapter);
			await adapter.stop();
			await adapter.cue(target);
			seen.length = 0;
			await adapter.stop();
			expect(seen).toEqual([]);
		});
	});

	describe("recover", () => {
		it("re-cues the previous target after an interruption", async () => {
			const adapter = await ready();
			adapter.interrupt("device-lost");
			const seen = kinds(adapter);
			await adapter.recover();
			expect(seen).toEqual(["cueing", "ready"]);
			expect(adapter.getStatus()).toEqual({ kind: "ready", target });
		});

		it("goes to idle when there was no target", async () => {
			const adapter = createFakeAdapter();
			await adapter.connect({ volume: 0.5 });
			adapter.interrupt("taken-over");
			await adapter.recover();
			expect(adapter.getStatus()).toEqual({ kind: "idle" });
		});
	});

	it("disconnect settles a pending clip with stopped", async () => {
		const adapter = await ready();
		const clip = adapter.playClip(500);
		adapter.disconnect();
		await expect(clip).resolves.toEqual({ kind: "stopped" });
		expect(adapter.getStatus()).toEqual({ kind: "disconnected" });
	});

	it("records every public call in order", async () => {
		const adapter = createFakeAdapter();
		await adapter.connect({ volume: 0.5 });
		await adapter.cue(target);
		await adapter.setVolume(0.25);
		await adapter.stop();
		await adapter.recover();
		await adapter.reveal();
		adapter.disconnect();
		expect(adapter.calls).toEqual([
			{ method: "connect", args: [{ volume: 0.5 }] },
			{ method: "cue", args: [target] },
			{ method: "setVolume", args: [0.25] },
			{ method: "stop", args: [] },
			{ method: "recover", args: [] },
			{ method: "reveal", args: [] },
			{ method: "disconnect", args: [] },
		]);
	});
});
