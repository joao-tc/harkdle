export type ShortcutAction = "play" | "skip";

export interface KeyInput {
	readonly code: string; // KeyboardEvent.code
	readonly altKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
	readonly repeat: boolean;
}

const ACTIONS: Readonly<Record<string, ShortcutAction>> = {
	Space: "play",
	KeyS: "skip",
};

// Matches on `code`, not `key`: on macOS, Option+S types "ß", so `key` is
// useless there while `code` stays "KeyS".
export function shortcutFor(event: KeyInput): ShortcutAction | null {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
		return null;
	}
	if (event.repeat) return null;
	return Object.hasOwn(ACTIONS, event.code)
		? (ACTIONS[event.code] ?? null)
		: null;
}
