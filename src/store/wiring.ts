import type { StoreApi } from "zustand/vanilla";
import type { GameStoreState } from "./game";
import type { PlaylistsState } from "./playlists";
import type { Screen, SessionState } from "./session";

const hasUser = (screen: Screen) =>
	screen.name === "signed-in" || screen.name === "setup";

// The signed-in user's id while the screen is "signed-in" or "setup", else null.
export function signedInUserId(session: StoreApi<SessionState>): string | null {
	const { screen } = session.getState();
	return screen.name === "signed-in" || screen.name === "setup"
		? screen.user.id
		: null;
}

// Resets the playlists store whenever the session screen leaves "signed-in"/"setup".
// Returns the unsubscribe function.
export function connectPlaylistsToSession(
	session: StoreApi<SessionState>,
	playlists: StoreApi<PlaylistsState>,
): () => void {
	return session.subscribe((state, prev) => {
		if (hasUser(prev.screen) && !hasUser(state.screen)) {
			playlists.getState().reset();
		}
	});
}

// When the session screen leaves "setup" (logout, expiry, Picker), calls game.leave().
// Returns the unsubscribe function.
export function connectGameToSession(
	session: StoreApi<SessionState>,
	game: StoreApi<GameStoreState>,
): () => void {
	return session.subscribe((state, prev) => {
		if (prev.screen.name === "setup" && state.screen.name !== "setup") {
			game.getState().leave();
		}
	});
}
