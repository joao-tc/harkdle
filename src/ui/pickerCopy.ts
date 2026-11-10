import type { ApiErrorKind, CleaningReport } from "@/store/playlists";

export const OPEN_SPOTIFY_URL = "https://open.spotify.com/";

export const playlistUrl = (id: string): string =>
	`https://open.spotify.com/playlist/${id}`;

type RemovedReason = keyof CleaningReport["removed"];

const REMOVED_ORDER: readonly RemovedReason[] = [
	"duplicate",
	"unavailable",
	"local",
	"episode",
];

const REMOVED_LABEL: Record<RemovedReason, (count: number) => string> = {
	duplicate: (n) => (n === 1 ? "1 duplicate" : `${n} duplicates`),
	unavailable: (n) => `${n} unavailable`,
	local: (n) => `${n} local`,
	episode: (n) => (n === 1 ? "1 episode" : `${n} episodes`),
};

export function cleaningSummary(report: CleaningReport): string {
	const parts = REMOVED_ORDER.filter(
		(reason) => report.removed[reason] > 0,
	).map((reason) => REMOVED_LABEL[reason](report.removed[reason]));
	if (parts.length === 0) return `${report.usable} usable · none removed`;
	const removed = REMOVED_ORDER.reduce(
		(sum, reason) => sum + report.removed[reason],
		0,
	);
	return `${report.usable} usable · ${removed} removed (${parts.join(", ")})`;
}

export function loadingText(loaded: number, total: number): string {
	if (total === 0) return "Loading tracks…";
	return `Loading ${loaded} of ${total} tracks…`;
}

export function tooFewText(usable: number, needed: number): string {
	const noun = usable === 1 ? "track" : "tracks";
	return `Only ${usable} usable ${noun}. harkdle needs at least ${needed}. Add songs in Spotify, then press Reload.`;
}

const DEV_MODE_RESTRICTED =
	"Spotify won't share this playlist's tracks. harkdle runs in Development Mode, which only reads playlists you own or collaborate on. Pick another one.";

const ERROR_COPY: Record<
	ApiErrorKind | "invalid-link",
	Record<"list" | "selection" | "paste", string>
> = {
	restricted: {
		list: "Spotify refused to list your playlists. Ask the owner to check the allowlist.",
		selection: DEV_MODE_RESTRICTED,
		paste: DEV_MODE_RESTRICTED,
	},
	"invalid-link": {
		list: "That isn't a Spotify playlist link. Paste a link like https://open.spotify.com/playlist/… or a spotify:playlist: URI.",
		selection:
			"That isn't a Spotify playlist link. Paste a link like https://open.spotify.com/playlist/… or a spotify:playlist: URI.",
		paste:
			"That isn't a Spotify playlist link. Paste a link like https://open.spotify.com/playlist/… or a spotify:playlist: URI.",
	},
	"not-found": {
		list: "That playlist doesn't exist, or it is private.",
		selection: "That playlist doesn't exist, or it is private.",
		paste: "That playlist doesn't exist, or it is private.",
	},
	"rate-limited": {
		list: "Spotify is rate-limiting harkdle. Wait a moment, then retry.",
		selection: "Spotify is rate-limiting harkdle. Wait a moment, then retry.",
		paste: "Spotify is rate-limiting harkdle. Wait a moment, then retry.",
	},
	network: {
		list: "Couldn't reach Spotify. Check your connection, then retry.",
		selection: "Couldn't reach Spotify. Check your connection, then retry.",
		paste: "Couldn't reach Spotify. Check your connection, then retry.",
	},
	unexpected: {
		list: "Spotify answered with something harkdle didn't expect. Retry, and tell the owner if it keeps happening.",
		selection:
			"Spotify answered with something harkdle didn't expect. Retry, and tell the owner if it keeps happening.",
		paste:
			"Spotify answered with something harkdle didn't expect. Retry, and tell the owner if it keeps happening.",
	},
	unauthorized: {
		list: "Your Spotify session ended.",
		selection: "Your Spotify session ended.",
		paste: "Your Spotify session ended.",
	},
};

export function errorText(
	error: ApiErrorKind | "invalid-link",
	context: "list" | "selection" | "paste",
): string {
	return ERROR_COPY[error][context];
}

export function restrictedPasteText(name: string, ownerName: string): string {
	return `"${name}" belongs to ${ownerName}. In Development Mode harkdle can only read playlists you own or collaborate on. Ask them to add you as a collaborator, or copy the songs into one of your own playlists.`;
}

export const EMPTY_LIST_TEXT =
	"No playlists to show. harkdle lists playlists you own or collaborate on. Create one in Spotify and press Refresh, or paste a link.";

export const ATTRIBUTION_TEXT = "Playlist data and artwork from Spotify";
