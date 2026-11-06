import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";

const SAME_AS_SONG = [
	"Song (feat. Someone)",
	"Song [Live at Wembley]",
	"Song - Live",
	"Song - Radio Edit",
	"Song - Single Version",
	"Song - Album Version",
	"Song - Mono",
	"Song (Stereo Mix)",
	"Song (Deluxe Edition)",
	"Song - 25th Anniversary Edition",
	"Song (Remastered) - Live",
	"Song - feat. A - Remastered 2011",
];

const SAME_AS_OTHER: [string, string][] = [
	["Hôtel California", "hotel california"],
	["Don’t Stop Believin'", "Dont Stop Believin"],
	["Bohemian Rhapsody - Remastered 2011", "Bohemian Rhapsody"],
	["Yesterday - 2009 Remaster", "Yesterday"],
	["P!nk", "Pnk"],
	["(Live)", "live"],
];

const STAYS_DISTINCT = [
	"Song - Remix",
	"Song (Acoustic)",
	"Song - Demo",
	"Song - Instrumental",
];

const IDEMPOTENT_INPUTS = [
	...SAME_AS_SONG,
	...SAME_AS_OTHER.map(([a]) => a),
	...STAYS_DISTINCT,
	"Live and Let Die",
	"Song (Live Forever)",
	"!!!",
	"   ",
];

describe("normalize", () => {
	it.each(SAME_AS_SONG)("treats %j as Song", (input) => {
		expect(normalize(input)).toBe(normalize("Song"));
	});

	it.each(SAME_AS_OTHER)("treats %j like %j", (a, b) => {
		expect(normalize(a)).toBe(normalize(b));
	});

	it.each(STAYS_DISTINCT)("keeps %j distinct from Song", (input) => {
		expect(normalize(input)).not.toBe(normalize("Song"));
	});

	it("leaves a leading live as part of the title", () => {
		expect(normalize("Live and Let Die")).toBe("live and let die");
	});

	it("treats live as a tag only when alone or followed by a venue-style word", () => {
		expect(normalize("Song (Live Forever)")).toBe("song live forever");
	});

	it("falls back to the pre-strip text instead of normalizing to empty", () => {
		expect(normalize("(Live)")).toBe("live");
	});

	it("keeps all-symbol text", () => {
		expect(normalize("!!!")).toBe("!!!");
	});

	it("returns empty for blank text", () => {
		expect(normalize("   ")).toBe("");
	});

	it("normalizes to lowercase unaccented words", () => {
		expect(normalize("Hôtel California")).toBe("hotel california");
	});

	it.each(IDEMPOTENT_INPUTS)("is idempotent for %j", (input) => {
		expect(normalize(normalize(input))).toBe(normalize(input));
	});
});
