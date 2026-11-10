import { describe, expect, it } from "vitest";
import type { AlbumKind, Track } from "@/game/types";
import { buildSuggestionIndex, MAX_SUGGESTIONS } from "./suggest";

function t(
	title: string,
	artists: [string, ...string[]],
	album: string,
	kind: AlbumKind = "album",
): Track {
	return { id: title, title, artists, album: { name: album, kind } };
}

const tracks: Track[] = [
	t("Blue Monday", ["New Order"], "Power, Corruption & Lies"),
	t("Bluebird", ["Wings", "Linda McCartney"], "Band on the Run"),
	t("Ablaze", ["Wings"], "Wings Greatest", "compilation"),
	t("Café del Mar", ["Energy 52"], "Café del Mar (Single)", "single"),
	t("Cafe Del Mar - Remastered", ["Energy 52"], "Other", "album"),
];

describe("candidate sets", () => {
	const index = buildSuggestionIndex(tracks);

	it("title suggestions come from titles only", () => {
		expect(index.suggest("title", "blue")).toEqual(["Blue Monday", "Bluebird"]);
	});

	it("artist suggestions include featured artists", () => {
		expect(index.suggest("artist", "linda")).toEqual(["Linda McCartney"]);
		expect(index.suggest("artist", "wings")).toEqual(["Wings"]);
	});

	it("album suggestions skip singles, EPs and compilations (P7)", () => {
		expect(index.suggest("album", "wings greatest")).toEqual([]);
		expect(index.suggest("album", "single")).toEqual([]);
		expect(index.suggest("album", "band")).toEqual(["Band on the Run"]);
	});

	it("never mixes kinds", () => {
		expect(index.suggest("artist", "blue")).toEqual([]);
		expect(index.suggest("album", "blue")).toEqual([]);
		expect(index.suggest("title", "new order")).toEqual([]);
	});

	it("de-duplicates by normalized form and keeps the first-seen spelling", () => {
		const out = index.suggest("title", "cafe");
		expect(out).toEqual(["Café del Mar"]);
		expect(index.suggest("artist", "energy")).toEqual(["Energy 52"]);
	});
});

describe("matching", () => {
	it.each([
		["case", "BLUE MONDAY"],
		["accents", "blué mondáy"],
		["punctuation", "blue, monday!"],
		["a substring from the first character", "blue mon"],
		["extra spacing", "  blue   mon  "],
	])("is insensitive to %s", (_label, query) => {
		const index = buildSuggestionIndex(tracks);
		expect(index.suggest("title", query)).toContain("Blue Monday");
	});

	it("matches accented candidates with plain typing", () => {
		const index = buildSuggestionIndex([t("Beyoncé", ["Beyoncé"], "Lemonade")]);
		expect(index.suggest("artist", "beyonce")).toEqual(["Beyoncé"]);
	});

	it("a punctuation-only candidate is never suggested but does not break the index", () => {
		const index = buildSuggestionIndex([t("!!!", ["!!!"], "!!!")]);
		expect(index.suggest("title", "a")).toEqual([]);
	});

	it("matches a substring anywhere, prefix matches first, then alphabetical", () => {
		const index = buildSuggestionIndex([
			t("Zebra Crossing", ["A"], "X"),
			t("Cross My Heart", ["A"], "X"),
			t("Across the Universe", ["A"], "X"),
			t("Crossroads", ["A"], "X"),
			t("Cross Road Blues", ["A"], "X"),
		]);
		expect(index.suggest("title", "cross")).toEqual([
			"Cross My Heart",
			"Cross Road Blues",
			"Crossroads",
			"Across the Universe",
			"Zebra Crossing",
		]);
	});

	it("is deterministic whatever the track order", () => {
		const a = buildSuggestionIndex(tracks).suggest("title", "b");
		const b = buildSuggestionIndex([...tracks].reverse()).suggest("title", "b");
		expect(a).toEqual(b);
	});

	it("typing a full version tag matches the base title (D5)", () => {
		const index = buildSuggestionIndex([
			t("Heroes - Remastered 2017", ["David Bowie"], "Heroes"),
		]);
		expect(index.suggest("title", "heroes - remastered")).toEqual([
			"Heroes - Remastered 2017",
		]);
	});
});

describe("limits and blanks", () => {
	it("returns at most 8", () => {
		const many = Array.from({ length: 30 }, (_, i) =>
			t(`Song ${String(i).padStart(2, "0")}`, ["A"], "X"),
		);
		const out = buildSuggestionIndex(many).suggest("title", "song");
		expect(MAX_SUGGESTIONS).toBe(8);
		expect(out).toHaveLength(8);
		expect(out[0]).toBe("Song 00");
		expect(out[7]).toBe("Song 07");
	});

	it.each(["", " ", "   \t", "!!!", "-"])(
		"a blank query %j returns []",
		(query) => {
			const index = buildSuggestionIndex(tracks);
			expect(index.suggest("title", query)).toEqual([]);
			expect(index.suggest("artist", query)).toEqual([]);
			expect(index.suggest("album", query)).toEqual([]);
		},
	);

	it("no match returns []", () => {
		expect(buildSuggestionIndex(tracks).suggest("title", "zzzz")).toEqual([]);
	});

	it("an empty track list yields empty suggestions", () => {
		const index = buildSuggestionIndex([]);
		expect(index.suggest("title", "a")).toEqual([]);
		expect(index.suggest("artist", "a")).toEqual([]);
		expect(index.suggest("album", "a")).toEqual([]);
	});
});
