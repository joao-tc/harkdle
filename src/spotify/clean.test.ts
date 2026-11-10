import { describe, expect, it } from "vitest";
import {
	type CleaningReport,
	cleanItems,
	continueGate,
	MIN_USABLE_TRACKS,
} from "./clean";

type Rec = Record<string, unknown>;

// Shaped like the verified output (spec.md §Verified API shapes); every name, id and ISRC is invented.
function track(n: number, over: Rec = {}): Rec {
	return {
		type: "track",
		id: `trk${n}`,
		uri: `spotify:track:trk${n}`,
		name: `Song ${n}`,
		is_playable: true,
		is_local: false,
		duration_ms: 200_000 + n,
		external_ids: { isrc: `ZZ0000000${String(n).padStart(3, "0")}` },
		artists: [{ name: `Artist ${n}` }],
		album: {
			name: `Album ${n}`,
			album_type: "album",
			images: [
				{ url: `https://img.test/${n}/640`, width: 640, height: 640 },
				{ url: `https://img.test/${n}/300`, width: 300, height: 300 },
				{ url: `https://img.test/${n}/64`, width: 64, height: 64 },
			],
		},
		episode: false,
		track: true,
		...over,
	};
}

function wrap(item: unknown, over: Rec = {}): Rec {
	return {
		added_at: "2025-01-01T00:00:00Z",
		added_by: { id: "someone" },
		is_local: false,
		primary_color: null,
		item,
		video_thumbnail: { url: null },
		...over,
	};
}

function sum(report: CleaningReport): number {
	const r = report.removed;
	return report.usable + r.local + r.episode + r.unavailable + r.duplicate;
}

describe("mapping", () => {
	it("maps a verified-shape wrapper to a PlaylistTrack", () => {
		const { tracks, report } = cleanItems([
			wrap(
				track(1, {
					artists: [{ name: "Main" }, { name: "Guest" }],
				}),
			),
		]);
		expect(tracks).toEqual([
			{
				id: "trk1",
				title: "Song 1",
				artists: ["Main", "Guest"],
				album: { name: "Album 1", kind: "album" },
				uri: "spotify:track:trk1",
				durationMs: 200_001,
				coverUrl: "https://img.test/1/640",
			},
		]);
		expect(report).toEqual({
			total: 1,
			usable: 1,
			removed: { local: 0, episode: 0, unavailable: 0, duplicate: 0 },
		});
	});

	it.each([
		["album", "album"],
		["single", "single"],
		["compilation", "compilation"],
		["ep", "album"], // unknown -> album (D9)
		[undefined, "album"],
		[7, "album"],
	])("album_type %j -> kind %s", (albumType, kind) => {
		const album = { name: "A", images: [] as unknown[], album_type: albumType };
		const { tracks } = cleanItems([wrap(track(1, { album }))]);
		expect(tracks[0]?.album.kind).toBe(kind);
	});

	it.each([
		["no images", []],
		["images missing", undefined],
		["a non-string url", [{ url: 5 }]],
		["a non-object image", ["x"]],
	])("coverUrl is null with %s", (_label, images) => {
		const album: Rec = { name: "A", album_type: "album" };
		if (images !== undefined) album.images = images;
		const { tracks } = cleanItems([wrap(track(1, { album }))]);
		expect(tracks[0]?.coverUrl).toBeNull();
	});

	it("keeps non-blank artist names in order and drops blank ones", () => {
		const artists = [
			{ name: "" },
			{ name: "Lead" },
			{ name: "  " },
			{ name: "Feat" },
			{},
		];
		const { tracks } = cleanItems([wrap(track(1, { artists }))]);
		expect(tracks[0]?.artists).toEqual(["Lead", "Feat"]);
	});

	it("keeps the playlist order", () => {
		const { tracks } = cleanItems([
			wrap(track(3)),
			wrap(track(1)),
			wrap(track(2)),
		]);
		expect(tracks.map((t) => t.id)).toEqual(["trk3", "trk1", "trk2"]);
	});

	it("a missing is_playable counts as playable (P5)", () => {
		const t = track(1);
		delete t.is_playable;
		const { tracks, report } = cleanItems([wrap(t)]);
		expect(tracks).toHaveLength(1);
		expect(report.removed.unavailable).toBe(0);
	});
});

describe("removal reasons", () => {
	// documented, not yet seen live (P16): local files, episodes, null items, is_playable: false
	const unusable: [string, unknown, "local" | "episode" | "unavailable"][] = [
		["wrapper is_local", wrap(track(1), { is_local: true }), "local"],
		["item is_local", wrap(track(1, { is_local: true })), "local"],
		["a local file with a null item", wrap(null, { is_local: true }), "local"],
		["an episode", wrap(track(1, { type: "episode" })), "episode"],
		[
			"is_playable false",
			wrap(track(1, { is_playable: false })),
			"unavailable",
		],
		["a null item", wrap(null), "unavailable"],
		["an undefined item", wrap(undefined), "unavailable"],
		["a non-object item", wrap("nope"), "unavailable"],
		["a null wrapper", null, "unavailable"],
		["a string wrapper", "x", "unavailable"],
		["an array wrapper", [], "unavailable"],
		["a missing id", wrap(track(1, { id: undefined })), "unavailable"],
		["a null id", wrap(track(1, { id: null })), "unavailable"],
		["a missing uri", wrap(track(1, { uri: undefined })), "unavailable"],
		["a missing name", wrap(track(1, { name: undefined })), "unavailable"],
		["an empty title", wrap(track(1, { name: "" })), "unavailable"],
		["a blank title", wrap(track(1, { name: "   " })), "unavailable"],
		[
			"a missing duration",
			wrap(track(1, { duration_ms: undefined })),
			"unavailable",
		],
		[
			"a string duration",
			wrap(track(1, { duration_ms: "200" })),
			"unavailable",
		],
		["a missing album", wrap(track(1, { album: undefined })), "unavailable"],
		["a null album", wrap(track(1, { album: null })), "unavailable"],
		[
			"an album without a name",
			wrap(track(1, { album: { album_type: "album" } })),
			"unavailable",
		],
		["no artists", wrap(track(1, { artists: [] })), "unavailable"],
		["artists missing", wrap(track(1, { artists: undefined })), "unavailable"],
		[
			"only blank artist names",
			wrap(track(1, { artists: [{ name: "" }, { name: " " }] })),
			"unavailable",
		],
	];

	it.each(unusable)("%s", (_label, item, reason) => {
		const { tracks, report } = cleanItems([item]);
		expect(tracks).toEqual([]);
		expect(report.total).toBe(1);
		expect(report.removed[reason]).toBe(1);
		expect(sum(report)).toBe(1);
	});

	it.each([
		[
			"local before episode",
			wrap(track(1, { type: "episode" }), { is_local: true }),
			"local",
		],
		[
			"local before unavailable",
			wrap(track(1, { is_playable: false }), { is_local: true }),
			"local",
		],
		[
			"episode before unavailable",
			wrap(track(1, { type: "episode", is_playable: false })),
			"episode",
		],
		["episode before a missing field", wrap({ type: "episode" }), "episode"],
	] as const)("one fate per item: %s", (_label, item, reason) => {
		const { report } = cleanItems([item]);
		expect(report.removed).toEqual({
			local: 0,
			episode: 0,
			unavailable: 0,
			duplicate: 0,
			[reason]: 1,
		});
	});

	it("a local duplicate counts as local only", () => {
		const { report } = cleanItems([
			wrap(track(1)),
			wrap(track(1), { is_local: true }),
		]);
		expect(report.usable).toBe(1);
		expect(report.removed.local).toBe(1);
		expect(report.removed.duplicate).toBe(0);
	});
});

describe("duplicates", () => {
	it("keeps the first of the same id", () => {
		const first = track(1, { name: "First" });
		const second = track(1, { name: "Second" });
		const { tracks, report } = cleanItems([wrap(first), wrap(second)]);
		expect(tracks.map((t) => t.title)).toEqual(["First"]);
		expect(report.removed.duplicate).toBe(1);
	});

	it("keeps the first of two ids sharing an ISRC", () => {
		const a = track(1, { external_ids: { isrc: "ZZ0000000999" } });
		const b = track(2, { external_ids: { isrc: "ZZ0000000999" } });
		const { tracks, report } = cleanItems([wrap(a), wrap(b)]);
		expect(tracks.map((t) => t.id)).toEqual(["trk1"]);
		expect(report.removed.duplicate).toBe(1);
	});

	it.each([
		["missing external_ids", undefined],
		["no isrc", {}],
		["a blank isrc", { isrc: "  " }],
		["a non-string isrc", { isrc: 5 }],
	])("without an ISRC (%s) dedupes by id only", (_label, ids) => {
		const mk = (n: number) => {
			const t = track(n);
			if (ids === undefined) delete t.external_ids;
			else t.external_ids = ids;
			return t;
		};
		const { tracks, report } = cleanItems([
			wrap(mk(1)),
			wrap(mk(2)),
			wrap(mk(1)),
		]);
		expect(tracks.map((t) => t.id)).toEqual(["trk1", "trk2"]);
		expect(report.removed.duplicate).toBe(1);
	});

	it("a removed item's id and ISRC do not enter the seen sets", () => {
		// The unplayable one is removed first, so its id/ISRC must not shadow the later playable twin.
		const bad = track(1, { is_playable: false });
		const good = track(1);
		const { tracks, report } = cleanItems([wrap(bad), wrap(good)]);
		expect(tracks.map((t) => t.id)).toEqual(["trk1"]);
		expect(report.removed).toEqual({
			local: 0,
			episode: 0,
			unavailable: 1,
			duplicate: 0,
		});
	});

	it("a duplicate's own ISRC does not shadow another track", () => {
		const a = track(1, { external_ids: { isrc: "AAA" } });
		const dup = track(1, { external_ids: { isrc: "BBB" } });
		const c = track(3, { external_ids: { isrc: "BBB" } });
		const { tracks, report } = cleanItems([wrap(a), wrap(dup), wrap(c)]);
		expect(tracks.map((t) => t.id)).toEqual(["trk1", "trk3"]);
		expect(report.removed.duplicate).toBe(1);
	});
});

describe("report accounting", () => {
	it("an empty list", () => {
		const { tracks, report } = cleanItems([]);
		expect(tracks).toEqual([]);
		expect(report).toEqual({
			total: 0,
			usable: 0,
			removed: { local: 0, episode: 0, unavailable: 0, duplicate: 0 },
		});
	});

	it("an all-unusable list", () => {
		const items = [
			wrap(null),
			wrap(track(1), { is_local: true }),
			wrap(track(2, { type: "episode" })),
			wrap(track(3, { is_playable: false })),
		];
		const { tracks, report } = cleanItems(items);
		expect(tracks).toEqual([]);
		expect(report.total).toBe(4);
		expect(sum(report)).toBe(4);
	});

	it("a mixed list adds up", () => {
		const items = [
			wrap(track(1)),
			wrap(track(2)),
			wrap(track(1)), // duplicate
			wrap(track(3), { is_local: true }),
			wrap(track(4, { type: "episode" })),
			wrap(track(5, { is_playable: false })),
			wrap(null),
			wrap(track(6)),
		];
		const { tracks, report } = cleanItems(items);
		expect(tracks.map((t) => t.id)).toEqual(["trk1", "trk2", "trk6"]);
		expect(report).toEqual({
			total: 8,
			usable: 3,
			removed: { local: 1, episode: 1, unavailable: 2, duplicate: 1 },
		});
		expect(sum(report)).toBe(report.total);
	});
});

describe("continueGate", () => {
	const reportOf = (usable: number): CleaningReport => ({
		total: usable,
		usable,
		removed: { local: 0, episode: 0, unavailable: 0, duplicate: 0 },
	});

	it("MIN_USABLE_TRACKS is 10", () => {
		expect(MIN_USABLE_TRACKS).toBe(10);
	});

	it.each([
		[0, { ok: false, reason: "too-few", usable: 0, needed: 10 }],
		[9, { ok: false, reason: "too-few", usable: 9, needed: 10 }],
		[10, { ok: true }],
		[500, { ok: true }],
	])("%i usable", (usable, gate) => {
		expect(continueGate(reportOf(usable))).toEqual(gate);
	});
});
