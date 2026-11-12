import type { StoreApi } from "zustand/vanilla";
import type { PlaylistsState } from "./playlists";
import type { SessionState } from "./session";
import type { SettingsHandle } from "./settings";

/** Saves the selected id when the session goes signed-in → setup (selection ready), and preselects the saved one (D4). Returns the unsubscribe. */
export function connectLastPlaylist(deps: {
	settings: SettingsHandle;
	session: StoreApi<SessionState>;
	playlists: StoreApi<PlaylistsState>;
}): () => void {
	const { settings, session, playlists } = deps;

	const stopSession = session.subscribe((state, prev) => {
		if (prev.screen.name !== "signed-in" || state.screen.name !== "setup") {
			return;
		}
		const { selection } = playlists.getState();
		if (selection.status === "ready") {
			settings.update({ lastPlaylistId: selection.summary.id });
		}
	});

	// Armed while the list is idle (start, or after logout's reset); fires on the first "ready".
	let armed = true;
	const stopPlaylists = playlists.subscribe((state) => {
		if (state.list.status === "idle") {
			armed = true;
			return;
		}
		if (!armed || state.list.status !== "ready") return;
		armed = false;
		if (state.selection.status !== "none") return;
		const savedId = settings.get().lastPlaylistId;
		const saved = state.list.playlists.find((p) => p.id === savedId);
		if (saved !== undefined) void state.select(saved);
	});

	return () => {
		stopSession();
		stopPlaylists();
	};
}
