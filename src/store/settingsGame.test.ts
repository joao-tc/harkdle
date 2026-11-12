import { describe, expect, it } from "vitest";
import { createHarness, flush } from "./gameHarness";
import { createSettings, SETTINGS_KEY } from "./settings";
import { connectSettingsToGame } from "./settingsGame";
import { memoryStorage } from "./settingsTestUtils";

function setup() {
	const storage = memoryStorage({
		initial: {
			[SETTINGS_KEY]: JSON.stringify({
				v: 1,
				volume: 0.35,
				rounds: 5,
				lastPlaylistId: null,
				startMode: "random",
			}),
		},
	});
	const settings = createSettings(storage);
	const h = createHarness();
	const unsubscribe = connectSettingsToGame(settings, h.store);
	const saved = () => JSON.parse(storage.data.get(SETTINGS_KEY) ?? "null");
	return { storage, settings, h, unsubscribe, saved };
}

describe("connectSettingsToGame", () => {
	it("puts the saved volume, rounds and start mode in the game store without writing", () => {
		const { storage, h } = setup();

		expect(h.store.getState().volume).toBe(0.35);
		expect(h.store.getState().rounds).toBe(5);
		expect(h.store.getState().startMode).toBe("random");
		expect(storage.writes).toBe(0);
	});

	it("hands the saved volume to the next connect", async () => {
		const { h } = setup();

		await h.store.getState().start(h.tracks);

		expect(h.calls("connect")).toEqual([[{ volume: 0.35 }]]);
	});

	it("does not call the adapter while applying the saved values", () => {
		const { h } = setup();

		expect(h.calls("setVolume")).toHaveLength(0);
	});

	it("saves when the volume changes", () => {
		const { storage, h, saved } = setup();

		h.store.getState().setVolume(0.5);

		expect(storage.writes).toBe(1);
		expect(saved()).toEqual({
			v: 1,
			volume: 0.5,
			rounds: 5,
			lastPlaylistId: null,
			startMode: "random",
		});
	});

	it("saves when the rounds change", () => {
		const { storage, h, saved } = setup();

		h.store.getState().setRounds(20);

		expect(storage.writes).toBe(1);
		expect(saved()).toEqual({
			v: 1,
			volume: 0.35,
			rounds: 20,
			lastPlaylistId: null,
			startMode: "random",
		});
	});

	it("saves when the start mode changes", () => {
		const { storage, h, saved } = setup();

		h.store.getState().setStartMode("classic");

		expect(storage.writes).toBe(1);
		expect(saved()).toEqual({
			v: 1,
			volume: 0.35,
			rounds: 5,
			lastPlaylistId: null,
			startMode: "classic",
		});
	});

	it("starts the next game with the saved start mode", async () => {
		const { h } = setup();

		await h.store.getState().start(h.tracks);

		const game = h.store.getState().game;
		expect(game?.startMode).toBe("random");
	});

	it("saves the clamped volume, not the raw one", () => {
		const { h, saved } = setup();

		h.store.getState().setVolume(7);

		expect(saved().volume).toBe(1);
	});

	it("keeps a saved lastPlaylistId", () => {
		const { settings, h, saved } = setup();
		settings.update({ lastPlaylistId: "pl1" });

		h.store.getState().setVolume(0.5);

		expect(saved().lastPlaylistId).toBe("pl1");
	});

	it("does not write for any other game-store change", async () => {
		const { storage, h } = setup();
		const store = h.store.getState();

		await store.start(h.tracks);
		expect(h.store.getState().stage).toBe("round");
		store.skip();
		await flush();
		store.giveUp();
		expect(h.store.getState().stage).toBe("reveal");
		store.next();
		await h.tick();
		await h.tick();
		await h.tick();
		store.leave();

		expect(h.store.getState().stage).toBe("idle");
		expect(storage.writes).toBe(0);
	});

	it("does not write when a set leaves volume and rounds as they are", () => {
		const { storage, h } = setup();

		h.store.getState().setVolume(0.35);
		h.store.getState().setRounds(5);
		h.store.getState().setStartMode("random");

		expect(storage.writes).toBe(0);
	});

	it("stops saving after the unsubscribe", () => {
		const { storage, h, unsubscribe } = setup();

		unsubscribe();
		h.store.getState().setVolume(0.9);
		h.store.getState().setRounds(10);

		expect(storage.writes).toBe(0);
	});
});
