import { describe, expect, it } from "vitest";
import { createSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from "./settings";
import { memoryStorage } from "./settingsTestUtils";

function loadFrom(raw: unknown) {
	const text = typeof raw === "string" ? raw : JSON.stringify(raw);
	return createSettings(
		memoryStorage({ initial: { [SETTINGS_KEY]: text } }),
	).get();
}

describe("defaults", () => {
	it("are 0.8 volume, 10 rounds and no playlist", () => {
		expect(DEFAULT_SETTINGS).toEqual({
			volume: 0.8,
			rounds: 10,
			lastPlaylistId: null,
		});
	});
});

describe("loading an unusable record", () => {
	it("loads defaults when the key is missing", () => {
		expect(createSettings(memoryStorage()).get()).toEqual(DEFAULT_SETTINGS);
	});

	it.each([
		["malformed JSON", "{"],
		["null", "null"],
		["an array", "[]"],
		["a string", '"x"'],
		["an unknown version", '{"v":2,"volume":0.1,"rounds":5}'],
		["a string version", '{"v":"1","volume":0.1,"rounds":5}'],
		["a missing version", '{"volume":0.1,"rounds":5}'],
	])("loads defaults for %s", (_name, raw) => {
		expect(loadFrom(raw)).toEqual(DEFAULT_SETTINGS);
	});

	it("loads defaults when getItem throws", () => {
		const settings = createSettings(memoryStorage({ failRead: true }));
		expect(settings.get()).toEqual(DEFAULT_SETTINGS);
	});
});

describe("loading a v1 record", () => {
	it("keeps a fully valid record", () => {
		const saved = { v: 1, volume: 0.3, rounds: 20, lastPlaylistId: "abc" };
		expect(loadFrom(saved)).toEqual({
			volume: 0.3,
			rounds: 20,
			lastPlaylistId: "abc",
		});
	});

	it.each([
		[7, 1],
		[-3, 0],
		[0, 0],
		[1, 1],
		["loud", 0.8],
		[null, 0.8],
		[Number.NaN, 0.8],
	])("volume %s becomes %s", (volume, expected) => {
		expect(loadFrom({ v: 1, volume }).volume).toBe(expected);
	});

	it("falls back when volume is absent", () => {
		expect(loadFrom({ v: 1 }).volume).toBe(0.8);
	});

	it.each([
		[7, 10],
		[5, 5],
		[20, 20],
		["5", 10],
		[null, 10],
	])("rounds %s becomes %s", (rounds, expected) => {
		expect(loadFrom({ v: 1, rounds }).rounds).toBe(expected);
	});

	it.each([
		["", null],
		[5, null],
		[null, null],
		["pl1", "pl1"],
	])("lastPlaylistId %s becomes %s", (lastPlaylistId, expected) => {
		expect(loadFrom({ v: 1, lastPlaylistId }).lastPlaylistId).toBe(expected);
	});

	it("falls back one bad field without touching the good ones", () => {
		expect(
			loadFrom({ v: 1, volume: 0.4, rounds: 7, lastPlaylistId: "pl1" }),
		).toEqual({ volume: 0.4, rounds: 10, lastPlaylistId: "pl1" });
		expect(
			loadFrom({ v: 1, volume: "loud", rounds: 5, lastPlaylistId: "" }),
		).toEqual({ volume: 0.8, rounds: 5, lastPlaylistId: null });
	});
});

describe("update", () => {
	it("merges the patch into the current settings", () => {
		const settings = createSettings(memoryStorage());
		settings.update({ volume: 0.2 });
		settings.update({ rounds: 5 });
		expect(settings.get()).toEqual({
			volume: 0.2,
			rounds: 5,
			lastPlaylistId: null,
		});
	});

	it("writes the whole versioned record under the settings key", () => {
		const storage = memoryStorage();
		createSettings(storage).update({ volume: 0.5, lastPlaylistId: "pl1" });
		expect(storage.writes).toBe(1);
		expect(JSON.parse(storage.data.get(SETTINGS_KEY) ?? "")).toEqual({
			v: 1,
			volume: 0.5,
			rounds: 10,
			lastPlaylistId: "pl1",
		});
	});

	it("is read back by a second createSettings over the same storage", () => {
		const storage = memoryStorage();
		createSettings(storage).update({
			volume: 0.5,
			rounds: 20,
			lastPlaylistId: "pl1",
		});
		expect(createSettings(storage).get()).toEqual({
			volume: 0.5,
			rounds: 20,
			lastPlaylistId: "pl1",
		});
	});

	it("does not re-read storage after loading", () => {
		const storage = memoryStorage();
		const settings = createSettings(storage);
		storage.data.set(SETTINGS_KEY, JSON.stringify({ v: 1, volume: 0.1 }));
		expect(settings.get()).toEqual(DEFAULT_SETTINGS);
	});

	it("swallows a throwing setItem and keeps the updated value in memory", () => {
		const storage = memoryStorage({ failWrite: true });
		const settings = createSettings(storage);
		expect(() => settings.update({ volume: 0.1 })).not.toThrow();
		expect(storage.writes).toBe(1);
		expect(settings.get().volume).toBe(0.1);
	});
});
