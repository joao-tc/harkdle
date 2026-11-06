import { describe, expect, it } from "vitest";
import { matchAlbum, matchArtist, matchTitle } from "@/game/match";
import type { Track } from "@/game/types";

function track(overrides: Partial<Track> = {}): Track {
	return {
		id: "t1",
		title: "Señorita - Remastered 2011",
		artists: ["Shawn Mendes", "Camila Cabello"],
		album: { name: "Shawn Mendes (Deluxe Edition)", kind: "album" },
		...overrides,
	};
}

const BLANKS = ["", " ", "\t\n  "] as const;

describe("matchTitle", () => {
	it.each([
		["Señorita - Remastered 2011", true],
		["senorita", true],
		["SEÑORITA", true],
		["Senorita (Remastered)", true],
		["  senorita  ", true],
		["Señorita Part 2", false],
		["Havana", false],
	])("guess %j -> %s", (guess, expected) => {
		expect(matchTitle(guess, track())).toBe(expected);
	});

	it("matches a same-titled song by another artist", () => {
		const other = track({ artists: ["Someone Else"] });
		expect(matchTitle("Senorita", other)).toBe(true);
	});

	it.each(BLANKS)("never matches blank guess %j", (guess) => {
		expect(matchTitle(guess, track())).toBe(false);
	});

	it("never matches a blank guess when the title normalizes to empty", () => {
		expect(matchTitle("", track({ title: "" }))).toBe(false);
		expect(matchTitle("  ", track({ title: " " }))).toBe(false);
	});
});

describe("matchArtist", () => {
	it.each([
		["Shawn Mendes", "main"],
		["shawn mendes", "main"],
		["Camila Cabello", "featured"],
		["camila cabello", "featured"],
		["Taylor Swift", null],
		["Shawn", null],
	] as const)("guess %j -> %s", (guess, expected) => {
		expect(matchArtist(guess, track())).toBe(expected);
	});

	it("matches accented artist names without accents", () => {
		const t = track({ artists: ["Beyoncé"] });
		expect(matchArtist("beyonce", t)).toBe("main");
	});

	it("prefers main when a featured artist normalizes equally", () => {
		const t = track({ artists: ["Drake", "DRAKE"] });
		expect(matchArtist("drake", t)).toBe("main");
	});

	it("matches any listed featured artist", () => {
		const t = track({ artists: ["A", "B", "C"] });
		expect(matchArtist("c", t)).toBe("featured");
	});

	it.each(BLANKS)("never matches blank guess %j", (guess) => {
		expect(matchArtist(guess, track())).toBeNull();
	});

	it("never matches a blank guess when an artist name normalizes to empty", () => {
		const t = track({ artists: ["", " "] });
		expect(matchArtist("", t)).toBeNull();
		expect(matchArtist("  ", t)).toBeNull();
	});
});

describe("matchAlbum", () => {
	it.each([
		["Shawn Mendes (Deluxe Edition)", true],
		["Shawn Mendes", true],
		["shawn mendes", true],
		["Illuminate", false],
	])("guess %j -> %s", (guess, expected) => {
		expect(matchAlbum(guess, track())).toBe(expected);
	});

	it.each(BLANKS)("never matches blank guess %j", (guess) => {
		expect(matchAlbum(guess, track())).toBe(false);
	});

	it("never matches a blank guess when the album name normalizes to empty", () => {
		const t = track({ album: { name: "", kind: "single" } });
		expect(matchAlbum("", t)).toBe(false);
		expect(matchAlbum(" ", t)).toBe(false);
	});
});
