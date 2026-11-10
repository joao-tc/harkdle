import { describe, expect, it } from "vitest";
import { parsePlaylistLink } from "./playlistLink";

const ID = "37i9dQZF1DXcBWIGoYBM5M"; // synthetic 22-char base62

describe("parsePlaylistLink accepts", () => {
	it.each([
		["a playlist uri", `spotify:playlist:${ID}`],
		["a user playlist uri", `spotify:user:some_user:playlist:${ID}`],
		["a plain url", `https://open.spotify.com/playlist/${ID}`],
		["an http url", `http://open.spotify.com/playlist/${ID}`],
		[
			"a url with ?si=",
			`https://open.spotify.com/playlist/${ID}?si=abc123def456`,
		],
		["a url with a hash", `https://open.spotify.com/playlist/${ID}#frag`],
		["an intl prefix", `https://open.spotify.com/intl-pt/playlist/${ID}`],
		[
			"an intl prefix and ?si=",
			`https://open.spotify.com/intl-de/playlist/${ID}?si=x`,
		],
		[
			"a region-suffixed intl prefix",
			`https://open.spotify.com/intl-pt-br/playlist/${ID}`,
		],
		["a trailing slash", `https://open.spotify.com/playlist/${ID}/`],
		[
			"surrounding whitespace",
			`  \n https://open.spotify.com/playlist/${ID}?si=x \t`,
		],
		["whitespace around a uri", ` spotify:playlist:${ID} `],
		["an upper-case host", `HTTPS://OPEN.SPOTIFY.COM/playlist/${ID}`],
	])("%s", (_label, input) => {
		expect(parsePlaylistLink(input)).toBe(ID);
	});
});

describe("parsePlaylistLink rejects", () => {
	it.each([
		["a bare id", ID],
		["an empty string", ""],
		["whitespace only", "   "],
		["unparsable text", "not a link at all"],
		["a too-short id", "https://open.spotify.com/playlist/abc123"],
		["a too-long id", `https://open.spotify.com/playlist/${ID}X`],
		[
			"a non-base62 id",
			"https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5-",
		],
		["a short uri id", "spotify:playlist:abc"],
		["an album uri", `spotify:album:${ID}`],
		["a track uri", `spotify:track:${ID}`],
		["an artist url", `https://open.spotify.com/artist/${ID}`],
		["an album url", `https://open.spotify.com/album/${ID}`],
		["another host", `https://example.com/playlist/${ID}`],
		[
			"a suffix look-alike host",
			`https://open.spotify.com.evil.test/playlist/${ID}`,
		],
		["a prefix look-alike host", `https://evilopen.spotify.com/playlist/${ID}`],
		["a user-info trick", `https://open.spotify.com@evil.test/playlist/${ID}`],
		[
			"user-info on the real host",
			`https://user:pw@open.spotify.com/playlist/${ID}`,
		],
		["a custom port", `https://open.spotify.com:8443/playlist/${ID}`],
		["another scheme", `ftp://open.spotify.com/playlist/${ID}`],
		["a js url", `javascript:alert("open.spotify.com/playlist/${ID}")`],
		["an extra path segment", `https://open.spotify.com/playlist/${ID}/extra`],
		["a bad intl prefix", `https://open.spotify.com/intl-/playlist/${ID}`],
		["a nested prefix", `https://open.spotify.com/x/playlist/${ID}`],
		["a uri with trailing text", `spotify:playlist:${ID}:more`],
	])("%s", (_label, input) => {
		expect(parsePlaylistLink(input)).toBeNull();
	});

	it("never throws", () => {
		for (const input of [
			"http://",
			"https://[",
			"%%%",
			"\u0000",
			":::",
			"spotify:",
		]) {
			expect(() => parsePlaylistLink(input)).not.toThrow();
		}
	});
});
