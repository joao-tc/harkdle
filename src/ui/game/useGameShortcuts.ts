import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { GameStoreState } from "@/store/game";
import { shortcutFor } from "@/store/shortcuts";

/**
 * ⌥Space plays and ⌥S skips, anywhere on the page, even inside a field (R17).
 * Listens on `document` in the capture phase so a focused input never sees the key.
 */
export function useGameShortcuts(
	game: StoreApi<GameStoreState>,
	enabled: boolean,
): void {
	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (event: KeyboardEvent) => {
			// Asked without the repeat flag so a held shortcut is still swallowed (macOS would
			// type a character for each repeat) while only the first press acts.
			const action = shortcutFor({
				code: event.code,
				altKey: event.altKey,
				ctrlKey: event.ctrlKey,
				metaKey: event.metaKey,
				shiftKey: event.shiftKey,
				repeat: false,
			});
			if (action === null) return;
			event.preventDefault();
			if (event.repeat) return;
			const state = game.getState();
			if (action === "play") state.play();
			else state.skip();
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [game, enabled]);
}
