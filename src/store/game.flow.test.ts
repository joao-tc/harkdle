import { describe, expect, it } from "vitest";
import { summarize } from "@/game/game";
import { PlaybackError } from "@/spotify/playback/adapter";
import { COUNTDOWN_FROM, COUNTDOWN_TICK_MS } from "./game";
import { createHarness, flush, type GameHarness } from "./gameHarness";

const ROUNDS = 5;

async function started(
	options: Parameters<typeof createHarness>[0] = {},
): Promise<GameHarness> {
	const h = createHarness(options);
	h.store.getState().setRounds(ROUNDS);
	await h.store.getState().start(h.tracks);
	return h;
}

function currentTrackTitle(h: GameHarness): string {
	const { game } = h.store.getState();
	if (game?.phase !== "round") throw new Error("not in a round");
	return game.round.track.title;
}

function queuedUri(h: GameHarness, index: number): string {
	const track = h.store.getState().game?.queue[index];
	if (!track) throw new Error(`no track at ${index}`);
	return `spotify:track:${track.id}`;
}

async function giveUp(h: GameHarness): Promise<void> {
	h.store.getState().giveUp();
	await flush();
}

async function skip(h: GameHarness): Promise<void> {
	h.store.getState().skip();
	await flush();
}

async function guessTitle(h: GameHarness): Promise<void> {
	h.store.getState().submit({ title: currentTrackTitle(h) });
	await flush();
}

/** Three ticks are needed: the countdown shows 3, then 2 and 1 after the first two. */
async function tickCountdown(h: GameHarness): Promise<void> {
	for (let i = 0; i < COUNTDOWN_FROM; i++) await h.tick();
}

async function next(h: GameHarness): Promise<void> {
	h.store.getState().next();
	await flush();
	await tickCountdown(h);
}

async function finishGame(h: GameHarness): Promise<void> {
	for (let round = 1; round <= ROUNDS; round++) {
		await giveUp(h);
		await next(h);
	}
}

describe("next", () => {
	it("counts 3, 2, 1 and opens the round only after the third tick", async () => {
		const h = await started();
		await giveUp(h);
		h.store.getState().next();
		await flush();

		const first = h.store.getState();
		expect(first.stage).toBe("countdown");
		expect(first.countdown).toBe(3);
		expect(first.game?.phase).toBe("round");
		expect(first.game?.cursor).toBe(1);
		expect(h.pendingSleeps()).toEqual([COUNTDOWN_TICK_MS]);
		expect(h.calls("cue")).toEqual([
			[{ uri: queuedUri(h, 0), startMs: 0 }],
			[{ uri: queuedUri(h, 1), startMs: 0 }],
		]);

		await h.tick();
		expect(h.store.getState().stage).toBe("countdown");
		expect(h.store.getState().countdown).toBe(2);
		await h.tick();
		expect(h.store.getState().stage).toBe("countdown");
		expect(h.store.getState().countdown).toBe(1);
		expect(h.pendingSleeps()).toEqual([COUNTDOWN_TICK_MS]);

		await h.tick();
		const { stage, countdown, playback } = h.store.getState();
		expect(stage).toBe("round");
		expect(countdown).toBeNull();
		expect(playback).toEqual({ kind: "ready" });
		expect(h.pendingSleeps()).toEqual([]);
	});

	it("stays at 1 until the cue is ready", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.holdCues();
		h.store.getState().next();
		await flush();
		await tickCountdown(h);

		const waiting = h.store.getState();
		expect(waiting.stage).toBe("countdown");
		expect(waiting.countdown).toBe(1);
		expect(waiting.playback).toEqual({ kind: "preparing" });

		h.adapter.releaseCue();
		await flush();
		expect(h.store.getState().stage).toBe("round");
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
		expect(h.store.getState().countdown).toBeNull();
	});

	it("clears the skipped notice when the next round begins", async () => {
		const h = createHarness();
		h.store.getState().setRounds(ROUNDS);
		h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
		await h.store.getState().start(h.tracks);
		expect(h.store.getState().skippedNotice).toBe(true);

		await giveUp(h);
		expect(h.store.getState().skippedNotice).toBe(true);
		h.adapter.holdCues();
		h.store.getState().next();
		expect(h.store.getState().skippedNotice).toBe(false);
	});

	it("does nothing outside reveal", async () => {
		const h = createHarness();
		const idle = h.store.getState();
		idle.next();
		expect(h.store.getState()).toBe(idle);

		await h.store.getState().start(h.tracks);
		const round = h.store.getState();
		round.next();
		expect(h.store.getState()).toBe(round);

		await giveUp(h);
		h.store.getState().next();
		await flush();
		const countdown = h.store.getState();
		const cues = h.calls("cue").length;
		countdown.next();
		expect(h.store.getState()).toBe(countdown);
		expect(h.calls("cue")).toHaveLength(cues);
	});

	it("finishes after the last round and stops the adapter", async () => {
		const h = await started();
		for (let round = 1; round < ROUNDS; round++) {
			await giveUp(h);
			await next(h);
		}
		await giveUp(h);
		expect(h.calls("stop")).toHaveLength(0);

		h.store.getState().next();
		await flush();
		const { stage, game, revealed, countdown } = h.store.getState();
		expect(stage).toBe("finished");
		expect(countdown).toBeNull();
		expect(game?.phase).toBe("finished");
		expect(revealed?.id).toBe(game?.results.at(-1)?.track.id);
		expect(h.calls("stop")).toHaveLength(1);
		expect(h.calls("cue")).toHaveLength(ROUNDS);
		expect(h.pendingSleeps()).toEqual([]);
		if (!game) throw new Error("no game");
		expect(summarize(game).roundsPlayed).toBe(ROUNDS);
	});

	it("is allowed after an interruption on the reveal, and re-cues", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.interrupt("taken-over");
		await flush();
		expect(h.store.getState().playback.kind).toBe("interrupted");

		await next(h);
		expect(h.store.getState().stage).toBe("round");
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
	});
});

describe("a track that fails to cue after round 1", () => {
	it("is replaced by the next one and raises the notice", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
		h.store.getState().next();
		await flush();

		const mid = h.store.getState();
		expect(mid.stage).toBe("countdown");
		expect(mid.skippedNotice).toBe(true);
		expect(mid.game?.cursor).toBe(2);
		expect(mid.game?.results).toHaveLength(1);
		expect(h.calls("cue")).toEqual([
			[{ uri: queuedUri(h, 0), startMs: 0 }],
			[{ uri: queuedUri(h, 1), startMs: 0 }],
			[{ uri: queuedUri(h, 2), startMs: 0 }],
		]);

		await tickCountdown(h);
		expect(h.store.getState().stage).toBe("round");
		expect(h.store.getState().skippedNotice).toBe(true);
		h.store.getState().dismissNotice();
		expect(h.store.getState().skippedNotice).toBe(false);
	});

	it("finishes early when every remaining track fails", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.holdCues();
		h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
		h.store.getState().next();
		for (let i = 1; i < h.tracks.length; i++) {
			await flush();
			h.adapter.failNextCue(new PlaybackError("cue-failed", "unplayable"));
			h.adapter.releaseCue();
		}
		await flush();
		await tickCountdown(h);

		const { stage, game, skippedNotice } = h.store.getState();
		expect(stage).toBe("finished");
		expect(game?.phase).toBe("finished");
		expect(game?.results).toHaveLength(1);
		expect(skippedNotice).toBe(true);
		expect(h.calls("cue")).toHaveLength(h.tracks.length);
	});
});

describe("an interruption while a cue is pending", () => {
	it("opens the countdown's round frozen when the device is taken over", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.holdCues();
		h.store.getState().next();
		await flush();
		h.adapter.interrupt("taken-over");
		h.adapter.releaseCue();
		await flush();
		expect(h.store.getState().stage).toBe("countdown");
		await tickCountdown(h);

		const { stage, game, playback, skippedNotice } = h.store.getState();
		expect(stage).toBe("round");
		expect(playback).toEqual({ kind: "interrupted", reason: "taken-over" });
		expect(skippedNotice).toBe(false);
		expect(game?.cursor).toBe(1);
		expect(game?.results).toHaveLength(1);
		expect(h.calls("cue")).toHaveLength(2);
	});

	it("opens the countdown's round without skipping when the cue finds the device lost", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.failNextCue(new PlaybackError("device-lost", "device lost"));
		h.store.getState().next();
		await flush();
		await tickCountdown(h);

		const { stage, game, skippedNotice } = h.store.getState();
		expect(stage).toBe("round");
		expect(skippedNotice).toBe(false);
		expect(game?.cursor).toBe(1);
		expect(game?.phase).toBe("round");
		expect(h.calls("cue")).toHaveLength(2);
	});

	it("opens round 1 frozen when the device is taken over during Start", async () => {
		const h = createHarness();
		h.adapter.holdCues();
		const done = h.store.getState().start(h.tracks);
		await flush();
		h.adapter.interrupt("taken-over");
		h.adapter.releaseCue();
		await done;

		const { stage, playback, game } = h.store.getState();
		expect(stage).toBe("round");
		expect(playback).toEqual({ kind: "interrupted", reason: "taken-over" });
		expect(game?.cursor).toBe(0);
	});
});

describe("recover", () => {
	async function interrupted(): Promise<GameHarness> {
		const h = await started();
		h.store.getState().play();
		h.adapter.interrupt("taken-over");
		await flush();
		return h;
	}

	it("brings the adapter back and unfreezes the round", async () => {
		const h = await interrupted();
		const done = h.store.getState().recover();
		expect(h.store.getState().recovery).toBe("working");
		await done;

		const { recovery, playback } = h.store.getState();
		expect(recovery).toBe("idle");
		expect(playback).toEqual({ kind: "ready" });
		expect(h.calls("recover")).toHaveLength(1);

		h.store.getState().skip();
		const { game } = h.store.getState();
		expect(game?.phase === "round" && game.round.step).toBe(2);
	});

	it("reports a failure and keeps the round frozen, and can be retried", async () => {
		const h = await interrupted();
		h.adapter.failNextRecover(new PlaybackError("device-lost", "offline"));
		await h.store.getState().recover();

		const failed = h.store.getState();
		expect(failed.recovery).toBe("failed");
		expect(failed.playback.kind).toBe("interrupted");
		failed.skip();
		failed.play();
		expect(h.store.getState()).toBe(failed);

		await h.store.getState().recover();
		expect(h.store.getState().recovery).toBe("idle");
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
		expect(h.calls("recover")).toHaveLength(2);
	});

	it("runs one attempt at a time", async () => {
		const h = await interrupted();
		h.adapter.holdCues();
		const first = h.store.getState().recover();
		const working = h.store.getState();
		await h.store.getState().recover();
		expect(h.store.getState()).toBe(working);
		expect(h.calls("recover")).toHaveLength(1);

		h.adapter.releaseCue();
		await first;
		expect(h.store.getState().recovery).toBe("idle");
	});

	it("does nothing unless the playback is interrupted", async () => {
		const h = await started();
		const before = h.store.getState();
		await before.recover();
		expect(h.store.getState()).toBe(before);
		expect(h.calls("recover")).toHaveLength(0);
	});

	it("is dropped by leave", async () => {
		const h = await interrupted();
		h.adapter.holdCues();
		const done = h.store.getState().recover();
		await flush();
		h.store.getState().leave();
		const after = h.store.getState();
		h.adapter.releaseCue();
		await done;
		expect(h.store.getState()).toBe(after);
		expect(after.recovery).toBe("idle");
	});
});

describe("playAgain", () => {
	it("starts a new game on the same tracks and rounds with a new order", async () => {
		const h = await started({ seeds: [7, 8] });
		await finishGame(h);
		const finished = h.store.getState();
		expect(finished.stage).toBe("finished");
		const firstIds = finished.game?.queue.map((track) => track.id) ?? [];

		h.adapter.holdCues();
		const done = h.store.getState().playAgain();
		await flush();
		expect(h.store.getState().stage).toBe("connecting");
		expect(h.store.getState().revealed).toBeNull();

		h.adapter.releaseCue();
		await done;
		const { stage, game, playback } = h.store.getState();
		expect(stage).toBe("round");
		expect(playback).toEqual({ kind: "ready" });
		expect(game?.rounds).toBe(ROUNDS);
		expect(game?.results).toEqual([]);
		const secondIds = game?.queue.map((track) => track.id) ?? [];
		expect(secondIds).not.toEqual(firstIds);
		expect([...secondIds].sort()).toEqual([...firstIds].sort());
		expect(h.calls("disconnect")).toHaveLength(0);
	});

	it("does nothing outside finished", async () => {
		const h = await started();
		const before = h.store.getState();
		await before.playAgain();
		expect(h.store.getState()).toBe(before);
		expect(h.calls("connect")).toHaveLength(1);
	});

	it("is cut off by leave during its cue", async () => {
		const h = await started();
		await finishGame(h);
		h.adapter.holdCues();
		const done = h.store.getState().playAgain();
		await flush();
		h.store.getState().leave();
		const after = h.store.getState();
		h.adapter.releaseCue();
		await done;
		expect(h.store.getState()).toBe(after);
	});
});

describe("leave during the countdown", () => {
	it("leaves nothing for the countdown or its cue to change", async () => {
		const h = await started();
		await giveUp(h);
		h.adapter.holdCues();
		h.store.getState().next();
		await flush();
		await h.tick();
		h.store.getState().leave();
		const after = h.store.getState();
		expect(after.stage).toBe("idle");
		expect(after.countdown).toBeNull();

		await h.tick();
		await h.tick();
		h.adapter.releaseCue();
		await flush();
		expect(h.store.getState()).toBe(after);
		expect(h.calls("cue")).toHaveLength(2);
	});
});

describe("a whole game", () => {
	it("ends with the summary of the scripted guesses", async () => {
		const h = await started();

		await guessTitle(h); // round 1: title at step 1
		await giveUp(h);
		await next(h);

		await skip(h); // round 2: title at step 2
		await guessTitle(h);
		await giveUp(h);
		await next(h);

		await giveUp(h); // round 3: nothing
		await next(h);

		for (let i = 0; i < 6; i++) await skip(h); // round 4: out of steps
		await next(h);

		await skip(h); // round 5: title at step 3
		await skip(h);
		await guessTitle(h);
		await giveUp(h);
		h.store.getState().next();
		await flush();

		const { stage, game } = h.store.getState();
		expect(stage).toBe("finished");
		if (!game) throw new Error("no game");
		expect(summarize(game)).toEqual({
			score: 1000 + 800 + 600,
			stepHistogram: { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0 },
			missed: 2,
			hatTricks: 0,
			roundsPlayed: ROUNDS,
		});
		expect(game.results.map((result) => result.endedBy)).toEqual([
			"gave-up",
			"gave-up",
			"gave-up",
			"out-of-steps",
			"gave-up",
		]);
	});
});
