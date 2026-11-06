const VERSION_TAGS: readonly RegExp[] = [
	/\bremaster(?:ed)?\b/,
	/^live$/,
	/^live (?:at|from|in|on|version|session|recording|\d{4})\b/,
	/^(?:radio edit|single version|album version|expanded edition|special edition|bonus track)\b/,
	/^(?:mono|stereo)\b/,
	/\bdeluxe\b/,
	/\banniversary edition\b/,
	/^(?:feat|ft|featuring)\b/,
];

const BRACKET_GROUP = /[([]([^()[\]]*)[)\]]/g;
const DASH_SEPARATOR = " - ";

function isVersionTag(content: string): boolean {
	const body = content.trim().replace(/^\d{4}\s+/, "");
	return VERSION_TAGS.some((tag) => tag.test(body));
}

function stripVersionTags(text: string): string {
	let current = text.trim();
	for (;;) {
		let next = current.replace(BRACKET_GROUP, (group, content: string) =>
			isVersionTag(content) ? "" : group,
		);
		next = next.trim();
		const dash = next.lastIndexOf(DASH_SEPARATOR);
		if (dash >= 0 && isVersionTag(next.slice(dash + DASH_SEPARATOR.length))) {
			next = next.slice(0, dash).trim();
		}
		if (next === current) return current;
		current = next;
	}
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export function normalize(text: string): string {
	const folded = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
	const stripped = stripVersionTags(folded);
	const base = stripped === "" ? folded : stripped;
	const cleaned = collapseWhitespace(base.replace(/[^\p{L}\p{N}\s]/gu, ""));
	return cleaned === "" ? collapseWhitespace(folded) : cleaned;
}
