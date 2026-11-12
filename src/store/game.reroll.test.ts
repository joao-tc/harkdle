import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/game/config";
import type { RoundState } from "@/game/round";
import { PlaybackError } from "@/spotify/playback/adapter";
import { createHarness, flush, type GameHarness } from "./gameHarness";

async function started(
	mode: "random" | "classic" = "random",
	rounds = 10,
): Promise<GameHarness> {
	const h = createHarness();
	h.store.getState().setStartMode(mode);
	h.store.getState().setRounds(rounds);
	await h.store.getState().start(h.tracks);
	return h;
}

function round(h: GameHarness): RoundState {
	const { game } = h.store.getState();
	if (game?.phase !== "round") throw new Error("not in a round");
	return game.round;
}

function cueFailed(): PlaybackError {
	return new PlaybackError("cue-failed", "unplayable");
}

function lastCue(h: GameHarness): unknown {
	return h.calls("cue").at(-1)?.[0];
}

async function nextRound(h: GameHarness): Promise<void> {
	h.store.getState().giveUp();
	await flush();
	h.store.getState().next();
	for (let i = 0; i < 3; i++) await h.tick();
}

describe("the cue of a round", () => {
	it("is the drawn start of round 1 in Random", async () => {
		const h = await started();
		const { startMs, track } = round(h);
		expect(startMs).toBeGreaterThan(0);
		expect(h.calls("cue")).toEqual([
			[{ uri: `spotify:track:${track.id}`, startMs }],
		]);
	});

	it("is 0 in Classic", async () => {
		const h = await started("classic");
		expect(h.calls("cue")).toEqual([
			[{ uri: `spotify:track:${round(h).track.id}`, startMs: 0 }],
		]);
		h.store.getState().reroll();
		await flush();
		expect(h.calls("cue")).toHaveLength(1);
	});

	it("is the drawn start of each next round", async () => {
		const h = await started();
		await nextRound(h);
		expect(h.store.getState().stage).toBe("round");
		expect(h.store.getState().game?.cursor).toBe(1);
		const { startMs, track } = round(h);
		expect(h.calls("cue")).toHaveLength(2);
		expect(lastCue(h)).toEqual({ uri: `spotify:track:${track.id}`, startMs });
	});

	it("is the replacement's own drawn start, with no reroll spent", async () => {
		const h = await started();
		const failed = round(h).track.id;
		h.store.getState().giveUp();
		await flush();
		h.adapter.failNextCue(cueFailed());
		h.store.getState().next();
		for (let i = 0; i < 3; i++) await h.tick();

		const { game, skippedNotice, stage } = h.store.getState();
		expect(stage).toBe("round");
		expect(skippedNotice).toBe(true);
		expect(game?.cursor).toBe(2);
		expect(game?.rerollsUsed).toBe(0);
		const { startMs, track } = round(h);
		expect(track.id).not.toBe(failed);
		expect(h.calls("cue")).toHaveLength(3);
		expect(lastCue(h)).toEqual({ uri: `spotify:track:${track.id}`, startMs });
	});
});

describe("reroll", () => {
	it("cues a new start at least 8 s away and keeps the step and locks", async () => {
		const h = await started();
		h.store.getState().submit({ title: round(h).track.title });
		await flush();
		h.store.getState().skip();
		await flush();
		const before = round(h);

		h.store.getState().reroll();
		const after = round(h);
		expect(Math.abs(after.startMs - before.startMs)).toBeGreaterThanOrEqual(
			DEFAULT_CONFIG.rerollMinDistanceMs,
		);
		expect(after.step).toBe(before.step);
		expect(after.locks).toEqual(before.locks);
		expect(h.store.getState().game?.rerollsUsed).toBe(1);
		expect(lastCue(h)).toEqual({
			uri: `spotify:track:${after.track.id}`,
			startMs: after.startMs,
		});

		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
		expect(h.store.getState().rerollNotice).toBe(false);
		h.store.getState().skip();
		expect(round(h).step).toBe(before.step + 1);
	});

	it("stops a playing clip", async () => {
		const h = await started();
		h.store.getState().play();
		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "playing" });
		h.store.getState().reroll();
		expect(h.store.getState().playback).toEqual({ kind: "preparing" });
		await flush();
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
		h.store.getState().play();
		expect(h.calls("playClip")).toHaveLength(2);
	});

	it("is applied once when called again before the cue settles", async () => {
		const h = await started();
		h.store.getState().reroll();
		h.store.getState().reroll();
		await flush();
		h.store.getState().reroll();
		expect(h.calls("cue")).toHaveLength(3);
		expect(h.store.getState().game?.rerollsUsed).toBe(2);
	});

	it("is ignored while a cue is held, then accepted", async () => {
		const h = await started();
		h.adapter.holdCues();
		h.store.getState().reroll();
		await flush();
		const held = round(h);
		h.store.getState().reroll();
		expect(round(h)).toBe(held);
		expect(h.calls("cue")).toHaveLength(2);

		h.adapter.releaseCue();
		await flush();
		h.adapter.holdCues();
		h.store.getState().reroll();
		expect(h.calls("cue")).toHaveLength(3);
	});
});

describe("a reroll whose cue fails", () => {
	it("restores the game, re-cues the old start and sets the notice", async () => {
		const h = await started();
		const before = h.store.getState().game;
		const old = round(h);
		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		await flush();

		const state = h.store.getState();
		expect(state.game).toBe(before);
		expect(state.game?.rerollsUsed).toBe(0);
		expect(state.rerollNotice).toBe(true);
		expect(state.skippedNotice).toBe(false);
		expect(state.stage).toBe("round");
		expect(state.playback).toEqual({ kind: "ready" });
		const uri = `spotify:track:${old.track.id}`;
		expect(h.calls("cue")).toHaveLength(3);
		expect(lastCue(h)).toEqual({ uri, startMs: old.startMs });
		expect(h.calls("cue")[1]?.[0]).not.toEqual({ uri, startMs: old.startMs });

		h.store.getState().skip();
		expect(round(h).step).toBe(2);
	});

	it("accepts another reroll afterwards", async () => {
		const h = await started();
		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		await flush();
		h.store.getState().reroll();
		expect(h.store.getState().game?.rerollsUsed).toBe(1);
		await flush();
		expect(h.calls("cue")).toHaveLength(4);
	});

	it("skips and replaces the track when the re-cue fails too, without a miss", async () => {
		const h = await started();
		const failed = round(h).track.id;
		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		h.adapter.failNextCue(cueFailed());
		await flush();

		const state = h.store.getState();
		expect(state.skippedNotice).toBe(true);
		expect(state.game?.cursor).toBe(1);
		expect(state.game?.results).toEqual([]);
		expect(state.game?.rerollsUsed).toBe(0);
		expect(state.stage).toBe("round");
		expect(state.playback).toEqual({ kind: "ready" });
		const { track, startMs } = round(h);
		expect(track.id).not.toBe(failed);
		expect(lastCue(h)).toEqual({ uri: `spotify:track:${track.id}`, startMs });

		h.store.getState().skip();
		expect(round(h).step).toBe(2);
	});

	it("is dropped by leave", async () => {
		const h = await started();
		h.adapter.holdCues();
		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		await flush();
		h.store.getState().leave();
		h.adapter.releaseCue();
		await flush();
		const state = h.store.getState();
		expect(state.stage).toBe("idle");
		expect(state.game).toBeNull();
		expect(state.rerollNotice).toBe(false);
		expect(h.calls("cue")).toHaveLength(2);
	});
});

describe("a reroll cut by an interruption", () => {
	it("stands, freezes the round, and Play here re-cues the new start", async () => {
		const h = await started();
		const old = round(h);
		h.adapter.holdCues();
		h.store.getState().reroll();
		await flush();
		const rerolled = round(h);
		expect(rerolled.startMs).not.toBe(old.startMs);

		h.adapter.interrupt("taken-over");
		h.adapter.releaseCue();
		await flush();
		const state = h.store.getState();
		expect(state.game?.phase).toBe("round");
		expect(round(h).startMs).toBe(rerolled.startMs);
		expect(state.game?.rerollsUsed).toBe(1);
		expect(state.rerollNotice).toBe(false);
		expect(state.playback).toEqual({
			kind: "interrupted",
			reason: "taken-over",
		});
		expect(h.calls("cue")).toHaveLength(2);

		h.store.getState().reroll();
		expect(round(h)).toBe(rerolled);

		const recovering = h.store.getState().recover();
		await flush();
		h.adapter.releaseCue();
		await recovering;
		expect(lastCue(h)).toEqual({
			uri: `spotify:track:${old.track.id}`,
			startMs: rerolled.startMs,
		});
		expect(h.store.getState().playback).toEqual({ kind: "ready" });
		expect(h.store.getState().recovery).toBe("idle");
		h.store.getState().skip();
		expect(round(h).step).toBe(2);
	});
});

describe("reroll is ignored", () => {
	it("on the reveal", async () => {
		const h = await started();
		h.store.getState().giveUp();
		await flush();
		const before = h.store.getState();
		h.store.getState().reroll();
		expect(h.store.getState()).toBe(before);
		expect(h.calls("cue")).toHaveLength(1);
	});

	it("while the round is frozen", async () => {
		const h = await started();
		h.adapter.interrupt("device-lost");
		await flush();
		const before = h.store.getState();
		h.store.getState().reroll();
		expect(h.store.getState()).toBe(before);
		expect(h.calls("cue")).toHaveLength(1);
	});

	it("while the next round is counting down", async () => {
		const h = await started();
		h.store.getState().giveUp();
		await flush();
		h.store.getState().next();
		await flush();
		expect(h.store.getState().stage).toBe("countdown");
		const before = h.store.getState();
		h.store.getState().reroll();
		expect(h.store.getState()).toBe(before);
	});

	it("once the game is finished", async () => {
		const h = await started("random", 5);
		for (let i = 0; i < 4; i++) await nextRound(h);
		h.store.getState().giveUp();
		await flush();
		h.store.getState().next();
		await flush();
		expect(h.store.getState().stage).toBe("finished");
		const before = h.store.getState();
		h.store.getState().reroll();
		expect(h.store.getState()).toBe(before);
	});

	it("after leave", async () => {
		const h = await started();
		h.store.getState().leave();
		const before = h.store.getState();
		h.store.getState().reroll();
		expect(h.store.getState()).toBe(before);
		expect(h.calls("cue")).toHaveLength(1);
	});
});

describe("leave during a reroll's cue", () => {
	it("changes nothing afterwards", async () => {
		const h = await started();
		h.adapter.holdCues();
		h.store.getState().reroll();
		await flush();
		h.store.getState().leave();
		const after = h.store.getState();
		h.adapter.releaseCue();
		await flush();
		expect(h.store.getState()).toBe(after);
		expect(after.stage).toBe("idle");
		expect(after.game).toBeNull();
		expect(h.calls("cue")).toHaveLength(2);
	});
});

describe("setStartMode", () => {
	it("is Classic by default", () => {
		expect(createHarness().store.getState().startMode).toBe("classic");
	});

	it("applies to the next start", async () => {
		const h = createHarness();
		h.store.getState().setStartMode("random");
		expect(h.store.getState().startMode).toBe("random");
		await h.store.getState().start(h.tracks);
		expect(h.store.getState().game?.startMode).toBe("random");
	});

	it("is ignored outside idle", async () => {
		const h = await started();
		h.store.getState().setStartMode("classic");
		expect(h.store.getState().startMode).toBe("random");
		expect(h.store.getState().game?.startMode).toBe("random");
	});

	it("is ignored while connecting", async () => {
		const h = createHarness();
		h.adapter.holdCues();
		const done = h.store.getState().start(h.tracks);
		await flush();
		h.store.getState().setStartMode("random");
		expect(h.store.getState().startMode).toBe("classic");
		h.adapter.releaseCue();
		await done;
	});

	it("survives leave", async () => {
		const h = await started();
		h.store.getState().leave();
		expect(h.store.getState().startMode).toBe("random");
		await h.store.getState().start(h.tracks);
		expect(h.store.getState().game?.startMode).toBe("random");
	});

	it("survives Play again, which resets the reroll budget", async () => {
		const h = await started("random", 5);
		h.store.getState().reroll();
		await flush();
		expect(h.store.getState().game?.rerollsUsed).toBe(1);
		for (let i = 0; i < 4; i++) await nextRound(h);
		h.store.getState().giveUp();
		await flush();
		h.store.getState().next();
		await flush();
		expect(h.store.getState().stage).toBe("finished");

		await h.store.getState().playAgain();
		const { game, startMode, stage } = h.store.getState();
		expect(stage).toBe("round");
		expect(startMode).toBe("random");
		expect(game?.startMode).toBe("random");
		expect(game?.rerollsUsed).toBe(0);
	});
});

describe("dismissRerollNotice", () => {
	it("clears the notice", async () => {
		const h = await started();
		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		await flush();
		expect(h.store.getState().rerollNotice).toBe(true);
		h.store.getState().dismissRerollNotice();
		expect(h.store.getState().rerollNotice).toBe(false);
	});

	it("is cleared by leave and by a new round", async () => {
		const h = await started();
		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		await flush();
		await nextRound(h);
		expect(h.store.getState().rerollNotice).toBe(false);

		h.adapter.failNextCue(cueFailed());
		h.store.getState().reroll();
		await flush();
		expect(h.store.getState().rerollNotice).toBe(true);
		h.store.getState().leave();
		expect(h.store.getState().rerollNotice).toBe(false);
	});
});
