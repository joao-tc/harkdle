import { describe, expect, it } from "vitest";
import type { ApiErrorKind, CleaningReport } from "@/store/playlists";
import {
	ATTRIBUTION_TEXT,
	cleaningSummary,
	EMPTY_LIST_TEXT,
	errorText,
	loadingText,
	OPEN_SPOTIFY_URL,
	playlistUrl,
	restrictedPasteText,
	tooFewText,
} from "@/ui/pickerCopy";

function report(
	usable: number,
	removed: Partial<CleaningReport["removed"]>,
): CleaningReport {
	const full = {
		local: 0,
		episode: 0,
		unavailable: 0,
		duplicate: 0,
		...removed,
	};
	const total =
		usable + full.local + full.episode + full.unavailable + full.duplicate;
	return { total, usable, removed: full };
}

describe("cleaningSummary", () => {
	it("lists every reason in the fixed order", () => {
		expect(
			cleaningSummary(
				report(412, { duplicate: 5, unavailable: 2, local: 1, episode: 1 }),
			),
		).toBe(
			"412 usable · 9 removed (5 duplicates, 2 unavailable, 1 local, 1 episode)",
		);
	});

	it("omits reasons with a zero count", () => {
		expect(cleaningSummary(report(100, { local: 3, duplicate: 1 }))).toBe(
			"100 usable · 4 removed (1 duplicate, 3 local)",
		);
	});

	it("pluralises duplicates and episodes only", () => {
		expect(
			cleaningSummary(
				report(10, { duplicate: 2, unavailable: 2, local: 2, episode: 2 }),
			),
		).toBe(
			"10 usable · 8 removed (2 duplicates, 2 unavailable, 2 local, 2 episodes)",
		);
		expect(
			cleaningSummary(
				report(10, { duplicate: 1, unavailable: 1, local: 1, episode: 1 }),
			),
		).toBe(
			"10 usable · 4 removed (1 duplicate, 1 unavailable, 1 local, 1 episode)",
		);
	});

	it("says none removed when nothing was removed", () => {
		expect(cleaningSummary(report(412, {}))).toBe("412 usable · none removed");
	});
});

describe("loadingText", () => {
	it("shows progress against the total", () => {
		expect(loadingText(120, 412)).toBe("Loading 120 of 412 tracks…");
	});

	it("omits the counts while the total is unknown", () => {
		expect(loadingText(0, 0)).toBe("Loading tracks…");
	});
});

describe("tooFewText", () => {
	it("pluralises the usable track count", () => {
		expect(tooFewText(7, 10)).toBe(
			"Only 7 usable tracks. harkdle needs at least 10. Add songs in Spotify, then press Reload.",
		);
		expect(tooFewText(0, 10)).toBe(
			"Only 0 usable tracks. harkdle needs at least 10. Add songs in Spotify, then press Reload.",
		);
	});

	it("uses the singular for one track", () => {
		expect(tooFewText(1, 10)).toBe(
			"Only 1 usable track. harkdle needs at least 10. Add songs in Spotify, then press Reload.",
		);
	});
});

describe("errorText", () => {
	const KINDS: ReadonlyArray<ApiErrorKind | "invalid-link"> = [
		"unauthorized",
		"restricted",
		"not-found",
		"rate-limited",
		"network",
		"unexpected",
		"invalid-link",
	];
	const CONTEXTS = ["list", "selection", "paste"] as const;

	it.each(CONTEXTS)(
		"has a distinct non-empty string per kind in %s",
		(context) => {
			const texts = KINDS.map((kind) => errorText(kind, context));
			for (const text of texts) expect(text.length).toBeGreaterThan(0);
			expect(new Set(texts).size).toBe(KINDS.length);
		},
	);

	it("words restricted differently for selection and list", () => {
		expect(errorText("restricted", "selection")).toBe(
			"Spotify won't share this playlist's tracks. harkdle runs in Development Mode, which only reads playlists you own or collaborate on. Pick another one.",
		);
		expect(errorText("restricted", "list")).toBe(
			"Spotify refused to list your playlists. Ask the owner to check the allowlist.",
		);
	});

	it("uses the Development Mode wording for restricted paste", () => {
		expect(errorText("restricted", "paste")).toBe(
			errorText("restricted", "selection"),
		);
	});

	it("words the remaining kinds", () => {
		expect(errorText("invalid-link", "paste")).toBe(
			"That isn't a Spotify playlist link. Paste a link like https://open.spotify.com/playlist/… or a spotify:playlist: URI.",
		);
		expect(errorText("not-found", "paste")).toBe(
			"That playlist doesn't exist, or it is private.",
		);
		expect(errorText("rate-limited", "list")).toBe(
			"Spotify is rate-limiting harkdle. Wait a moment, then retry.",
		);
		expect(errorText("network", "selection")).toBe(
			"Couldn't reach Spotify. Check your connection, then retry.",
		);
		expect(errorText("unexpected", "list")).toBe(
			"Spotify answered with something harkdle didn't expect. Retry, and tell the owner if it keeps happening.",
		);
		expect(errorText("unauthorized", "list")).toBe(
			"Your Spotify session ended.",
		);
	});
});

describe("restrictedPasteText", () => {
	it("names the playlist and its owner", () => {
		expect(restrictedPasteText("Road Trip", "Ana")).toBe(
			'"Road Trip" belongs to Ana. In Development Mode harkdle can only read playlists you own or collaborate on. Ask them to add you as a collaborator, or copy the songs into one of your own playlists.',
		);
	});
});

describe("constants", () => {
	it("exposes the Spotify links", () => {
		expect(OPEN_SPOTIFY_URL).toBe("https://open.spotify.com/");
		expect(playlistUrl("abc123")).toBe(
			"https://open.spotify.com/playlist/abc123",
		);
	});

	it("exposes the fixed texts", () => {
		expect(EMPTY_LIST_TEXT).toBe(
			"No playlists to show. harkdle lists playlists you own or collaborate on. Create one in Spotify and press Refresh, or paste a link.",
		);
		expect(ATTRIBUTION_TEXT).toBe("Playlist data and artwork from Spotify");
	});
});
