import type { StoreApi } from "zustand/vanilla";
import type { GameStoreState } from "./game";
import type { SettingsHandle } from "./settings";

/** Applies settings.get() volume and rounds to the game store now, then saves them when either changes. Returns the unsubscribe. */
export function connectSettingsToGame(
	settings: SettingsHandle,
	game: StoreApi<GameStoreState>,
): () => void {
	const { volume, rounds } = settings.get();
	// Plain setState: setVolume would also call the adapter, which is not connected yet.
	game.setState({ volume, rounds });
	return game.subscribe((state, prev) => {
		if (state.volume === prev.volume && state.rounds === prev.rounds) return;
		settings.update({ volume: state.volume, rounds: state.rounds });
	});
}
