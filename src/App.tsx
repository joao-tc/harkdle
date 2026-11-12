import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { GameStoreState } from "@/store/game";
import type { PlaylistsState } from "@/store/playlists";
import type { SessionState } from "@/store/session";
import { GameFlow } from "@/ui/game/GameFlow";
import { LoginScreen } from "@/ui/LoginScreen";
import { PlaylistPicker } from "@/ui/PlaylistPicker";
import { SetupErrorScreen } from "@/ui/SetupErrorScreen";

export function App({
	session,
	playlists,
	game,
	devUrl,
}: {
	session: StoreApi<SessionState>;
	playlists: StoreApi<PlaylistsState>;
	game: StoreApi<GameStoreState>;
	devUrl: string;
}) {
	const screen = useStore(session, (s) => s.screen);
	const selection = useStore(playlists, (s) => s.selection);
	const { login, retry, logout, toSetup, toPicker } = session.getState();

	switch (screen.name) {
		case "booting":
		case "checking":
			return (
				<main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
					Loading…
				</main>
			);
		case "login":
			return <LoginScreen onLogin={login} />;
		case "setup-error":
			return (
				<SetupErrorScreen
					error={screen.error}
					detail={screen.detail}
					devUrl={devUrl}
					onRetry={retry}
					onLogout={logout}
				/>
			);
		case "signed-in":
			return (
				<PlaylistPicker
					user={screen.user}
					playlists={playlists}
					onContinue={toSetup}
					onLogout={logout}
				/>
			);
		case "setup":
			if (selection.status === "ready" && selection.gate.ok) {
				return (
					<GameFlow
						game={game}
						playlists={playlists}
						summary={selection.summary}
						onBack={toPicker}
					/>
				);
			}
			return (
				<PlaylistPicker
					user={screen.user}
					playlists={playlists}
					onContinue={toSetup}
					onLogout={logout}
				/>
			);
	}
}
