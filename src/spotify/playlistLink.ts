const ID = "[A-Za-z0-9]{22}";
const URI = new RegExp(`^spotify:(?:user:[^:\\s]+:)?playlist:(${ID})$`);
const URL_PATH = new RegExp(
	`^(?:/intl-[a-z]{2}(?:-[a-z]+)?)?/playlist/(${ID})/?$`,
);

// Returns the 22-character base62 playlist id, or null for anything else.
// Accepts: spotify:playlist:<id> · spotify:user:<name>:playlist:<id> ·
// https://open.spotify.com/playlist/<id> and /intl-xx/playlist/<id>, with any ?query or #hash.
export function parsePlaylistLink(input: string): string | null {
	const text = input.trim();
	if (text === "") return null;

	const uri = URI.exec(text);
	if (uri) return uri[1] ?? null;

	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.hostname !== "open.spotify.com") return null;
	if (url.username !== "" || url.password !== "" || url.port !== "")
		return null;
	return URL_PATH.exec(url.pathname)?.[1] ?? null;
}
