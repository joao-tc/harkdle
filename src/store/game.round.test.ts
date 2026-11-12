import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import type { RoundState } from "@/game/round";
import { LAST_STEP, type Step } from "@/game/types";
import { PlaybackError } from "@/spotify/playback/adapter";
import { DEFAULT_VOLUME } from "./game";
import { createHarness, flush, type GameHarness } from "./gameHarness";

async function started(): Promise<GameHarness> {
	const h = createHarness();
	await h.store.getState().start(h.tracks);
	return h;
}

function round(h: GameHarness): RoundState {
	const { game } = h.store.getState();
	if (game?.phase !== "round") throw new Error("not in a round");
	return game.round;
}

function queuedUri(h: GameHarness, index: number): string {
	const track = h.store.getState().game?.queue[index];
	if (!track) throw new Error(`no track at ${index}`);
	return `spotify:track:${track.id}`;
}

describe("start", () => {
	it("goes from connecting to round once the first cue resolved", async () => {
		const h = createHarness();
		h.adapter.holdCues();
		const done = h.store.getState().start(h.tracks);
		await flush();
		expect(h.store.getState().stage).toBe("connecting");
		expect(h.calls("connect")).toEqual([[{ volume: DEFAULT_VOLUME }]]);

		h.adapter.releaseCue();
		await done;
		const { stage, playback } = h.store.getState();
		expect(stage).toBe("round");
		expect(playback).toEqual({ kind: "ready" });
		expect(h.calls("cue")).toEqual([[{ uri: queuedUri(h, 0), startMs: 0 }]]);
		expect(h.calls("connect")).toHaveLength(1);
	});

	it("passes the chosen volume to connect", async () => {
		const h = createHarness();
		h.store.getState().setVolume(0.3);
		await h.store.getState().start(h.tracks);
		expect(h.calls("connect")).toEqual([[{ volume: 0.3 }]]);
	});

	it("runs the chosen rounds through pickRounds", async () => {
		const h = createHarness();
		h.store.getState().setRounds(20);
		await h.store.getState().start(h.tracks);
		expect(h.store.getState().game?.rounds).toBe(10);
		expect(h.store.getState().rounds).toBe(20);

		const five = createHarness();
		five.store.getState().setRounds(5);
		await five.store.getState().start(five.tracks);
		expect(five.store.getState().game?.rounds).toBe(5);
	});

	it("returns to idle and reports a connect failure", async () => {
		const h = createHarness();
		const error = new PlaybackError("authentication", "no token");
		h.adapter.failNextConnect(error);
		await h.store.getState().start(h.tracks);
		const { stage, game, playback } = h.store.getState();
		expect(stage).toBe("idle");
		expect(game).toBeNull();
		expect(playback).toEqual({ kind: "preparing" });
		expect(h.startFailures).toEqual([error]);
		expect(h.calls("cue")).toHaveLength(0);
	});

	it("does nothing outside idle", async () => {
		const h = await started();
		const before = h.store.getState();
		await h.store.getState().start(h.tracks);
		expect(h.store.getState()).toBe(before);
		expect(h.calls("connect")).toHaveLength(1);
	});

	it("rejects too few tracks without changing anything", async () => {
		const h = createHarness();
		const before = h.store.getState();
		await expect(
			h.store.getState().start(h.tracks.slice(0, 4)),
		).rejects.toBeInstanceOf(RangeError);
		expect(h.store.getState()).toBe(before);
	});
});

describe("a track that fails to cue before round 1", () => {
	it("is replaced by the next one while the stage stays connecting", async () => {
		const h = createHarness();
		h.adapter.holdCues();
		h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
		const done = h.store.getState().start(h.tracks);
		await flush();
		h.adapter.releaseCue();
		await flush();

		const mid = h.store.getState();
		expect(mid.stage).toBe("connecting");
		expect(mid.skippedNotice).toBe(true);
		expect(mid.game?.cursor).toBe(1);
		expect(mid.game?.results).toEqual([]);
		expect(h.calls("cue")).toHaveLength(2);

		h.adapter.releaseCue();
		await done;
		const { stage, game } = h.store.getState();
		expect(stage).toBe("round");
		expect(game?.phase).toBe("round");
		expect(h.calls("cue")).toEqual([
			[{ uri: queuedUri(h, 0), startMs: 0 }],
			[{ uri: queuedUri(h, 1), startMs: 0 }],
		]);
	});

	it("finishes early when every track fails", async () => {
		const h = createHarness();
		h.adapter.holdCues();
		h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
		const done = h.store.getState().start(h.tracks);
		for (let i = 0; i < h.tracks.length; i++) {
			await flush();
			h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
			h.adapter.releaseCue();
		}
		await done;
		const { stage, game, skippedNotice, revealed } = h.store.getState();
		expect(stage).toBe("finished");
		expect(game?.phase).toBe("finished");
		expect(game?.results).toEqual([]);
		expect(skippedNotice).toBe(true);
		expect(revealed).toBeNull();
		expect(h.calls("cue")).toHaveLength(h.tracks.length);
	});
});

describe("play", () => {
	it("plays the clip for each step, once", async () => {
		const h = await started();
		for (const step of [1, 2, 3, 4, 5, 6] as const) {
			expect(round(h).step).toBe(step);
			h.store.getState().play();
			h.store.getState().play();
			await flush();
			expect(h.calls("playClip").at(-1)).toEqual([DEFAULT_CONFIG.clipMs[step]]);
			expect(h.calls("playClip")).toHaveLength(step);
			expect(h.store.getState().playback).toEqual({ kind: "playing" });
			h.adapter.endClip();
			await flush();
			if (step < LAST_STEP) h.store.getState().skip();
			await flush();
		}
	});

	it("is ignored until the adapter is ready", async () => {
		const h = createHarness();
		h.adapter.holdCues();
		const done = h.store.getState().start(h.tracks);
		await flush();
		h.store.getState().play();
		expect(h.calls("playClip")).toHaveLength(0);
		h.adapter.releaseCue();
		await done;
		h.store.getState().play();
		expect(h.calls("playClip")).toHaveLength(1);
	});
});

describe("submit", () => {
	it("advances a step and stops the clip on a wrong guess", async () => {
		const h = await started();
		h.store.getState().play();
		h.store.getState().submit({ title: "nope" });
		expect(round(h).step).toBe(2);
		expect(h.calls("stop")).toHaveLength(1);
		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
	});

	it("locks a correct title and continues without advancing", async () => {
		const h = await started();
		h.store.getState().play();
		h.store.getState().submit({ title: round(h).track.title });
		const { locks, step, ended } = round(h);
		expect(locks.title).toEqual({ step: 1, credit: "full" });
		expect(locks.artist).toBeUndefined();
		expect(locks.album).toBeUndefined();
		expect(step).toBe(1);
		expect(ended).toBeNull();
		expect(h.calls("stop")).toHaveLength(1);
		expect(h.store.getState().stage).toBe("round");
	});

	it("reveals the track when the guess completes the round", async () => {
		const h = await started();
		h.store.getState().play();
		const { track } = round(h);
		h.store.getState().submit({
			title: track.title,
			artist: track.artists[0],
			album: track.album.name,
		});
		const { stage, game, revealed } = h.store.getState();
		expect(stage).toBe("reveal");
		expect(game?.phase).toBe("reveal");
		expect(game?.results[0]?.endedBy).toBe("complete");
		expect(revealed?.id).toBe(track.id);
		expect(h.calls("reveal")).toHaveLength(1);
		expect(h.calls("stop")).toHaveLength(0);
		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "revealing" });
	});

	it("changes nothing on a blank guess", async () => {
		const h = await started();
		const before = h.store.getState();
		const calls = h.adapter.calls.length;
		h.store.getState().submit({});
		h.store.getState().submit({ title: "  ", artist: "" });
		expect(h.store.getState()).toBe(before);
		expect(h.adapter.calls).toHaveLength(calls);
	});
});

describe("skip and give up", () => {
	it("ends the round out of steps on the sixth skip and reveals", async () => {
		const h = await started();
		for (let i = 1; i < LAST_STEP; i++) {
			h.store.getState().skip();
			await flush();
			expect(round(h).step).toBe((i + 1) as Step);
		}
		expect(h.store.getState().stage).toBe("round");
		h.store.getState().skip();
		const { stage, game, revealed } = h.store.getState();
		expect(stage).toBe("reveal");
		expect(game?.results[0]?.endedBy).toBe("out-of-steps");
		expect(revealed?.id).toBe(game?.results[0]?.track.id);
		expect(h.calls("reveal")).toHaveLength(1);
	});

	it("reveals on give up mid-clip without stopping it", async () => {
		const h = await started();
		h.store.getState().play();
		h.store.getState().giveUp();
		expect(h.store.getState().stage).toBe("reveal");
		expect(h.store.getState().game?.results[0]?.endedBy).toBe("gave-up");
		expect(h.calls("reveal")).toHaveLength(1);
		expect(h.calls("stop")).toHaveLength(0);
		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "revealing" });
	});

	it("ignores round actions once the reveal began", async () => {
		const h = await started();
		h.store.getState().giveUp();
		await flush();
		const before = h.store.getState();
		h.store.getState().skip();
		h.store.getState().giveUp();
		h.store.getState().submit({ title: "x" });
		h.store.getState().play();
		expect(h.store.getState()).toBe(before);
		expect(h.calls("reveal")).toHaveLength(1);
	});
});

describe("settling", () => {
	it("advances once for two skips in the same tick", async () => {
		const h = await started();
		h.store.getState().play();
		h.store.getState().skip();
		h.store.getState().skip();
		expect(round(h).step).toBe(2);
		expect(h.calls("stop")).toHaveLength(1);

		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
		h.store.getState().skip();
		expect(round(h).step).toBe(3);
	});

	it("ignores actions while the re-cue is held, then accepts them", async () => {
		const h = await started();
		h.adapter.holdCues();
		h.store.getState().play();
		h.store.getState().skip();
		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "preparing" });
		h.store.getState().skip();
		h.store.getState().giveUp();
		expect(round(h).step).toBe(2);

		h.adapter.releaseCue();
		await flush();
		h.store.getState().skip();
		expect(round(h).step).toBe(3);
	});
});

describe("a hidden tab", () => {
	it("changes neither the step nor the locks, and play works again", async () => {
		const h = await started();
		h.store.getState().submit({ title: round(h).track.title });
		await flush();
		h.store.getState().skip();
		await flush();
		const before = round(h);
		h.store.getState().play();
		h.adapter.hideTab();
		await flush();
		expect(round(h)).toEqual(before);
		expect(h.store.getState().stage).toBe("round");
		expect(h.store.getState().playback).toEqual({ kind: "ready" });

		h.store.getState().play();
		expect(h.calls("playClip")).toHaveLength(2);
	});
});

describe("an interruption", () => {
	it("freezes the round", async () => {
		const h = await started();
		h.store.getState().play();
		h.adapter.interrupt("taken-over");
		await flush();
		const before = h.store.getState();
		expect(before.playback).toEqual({
			kind: "interrupted",
			reason: "taken-over",
		});

		const calls = h.adapter.calls.length;
		h.store.getState().play();
		h.store.getState().submit({ title: round(h).track.title });
		h.store.getState().skip();
		h.store.getState().giveUp();
		expect(h.store.getState()).toBe(before);
		expect(h.adapter.calls).toHaveLength(calls);
	});

	it("shows a disconnect after Start as a lost device", async () => {
		const h = await started();
		h.adapter.disconnect();
		expect(h.store.getState().playback).toEqual({
			kind: "interrupted",
			reason: "device-lost",
		});
		expect(h.store.getState().stage).toBe("round");
	});
});

describe("leave", () => {
	it("drops a held cue", async () => {
		const h = createHarness();
		h.store.getState().setRounds(5);
		h.store.getState().setVolume(0.3);
		h.adapter.holdCues();
		const done = h.store.getState().start(h.tracks);
		await flush();
		h.store.getState().leave();
		const after = h.store.getState();
		expect(after.stage).toBe("idle");
		expect(after.game).toBeNull();
		expect(after.rounds).toBe(5);
		expect(after.volume).toBe(0.3);

		h.adapter.releaseCue();
		await done;
		await flush();
		expect(h.store.getState()).toBe(after);
		expect(h.calls("disconnect")).toHaveLength(1);
		expect(h.calls("cue")).toHaveLength(1);
	});

	it("drops a connect in flight", async () => {
		const h = createHarness();
		const done = h.store.getState().start(h.tracks);
		h.store.getState().leave();
		const after = h.store.getState();
		expect(after.stage).toBe("idle");
		expect(after.game).toBeNull();

		await done;
		await flush();
		expect(h.store.getState()).toBe(after);
		expect(h.calls("disconnect")).toHaveLength(1);
		expect(h.calls("cue")).toHaveLength(0);
	});

	it("does not report a connect failure that arrives after it", async () => {
		const h = createHarness();
		h.adapter.failNextConnect(new PlaybackError("sdk-load", "offline"));
		const done = h.store.getState().start(h.tracks);
		h.store.getState().leave();
		await done;
		expect(h.startFailures).toEqual([]);
	});

	it("ends a game in progress and allows a new start", async () => {
		const h = await started();
		h.store.getState().play();
		h.store.getState().leave();
		const { stage, game, revealed, playback } = h.store.getState();
		expect(stage).toBe("idle");
		expect(game).toBeNull();
		expect(revealed).toBeNull();
		expect(playback).toEqual({ kind: "preparing" });
		expect(h.calls("disconnect")).toHaveLength(1);

		await h.store.getState().start(h.tracks);
		expect(h.store.getState().stage).toBe("round");
	});
});

describe("volume", () => {
	it("clamps to 0-1", () => {
		const h = createHarness();
		h.store.getState().setVolume(1.5);
		expect(h.store.getState().volume).toBe(1);
		h.store.getState().setVolume(-1);
		expect(h.store.getState().volume).toBe(0);
	});

	it("reaches the adapter only when connected", async () => {
		const h = createHarness();
		h.store.getState().setVolume(0.5);
		expect(h.calls("setVolume")).toHaveLength(0);

		await h.store.getState().start(h.tracks);
		h.store.getState().setVolume(1.5);
		expect(h.calls("setVolume")).toEqual([[1]]);
	});
});
