import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { PlaylistsState } from "@/store/playlists";
import type { SessionState } from "@/store/session";
import { LoginScreen } from "@/ui/LoginScreen";
import { PlaylistPicker } from "@/ui/PlaylistPicker";
import { SetupErrorScreen } from "@/ui/SetupErrorScreen";
import { SetupStandIn } from "@/ui/SetupStandIn";

export function App({
	session,
	playlists,
	devUrl,
}: {
	session: StoreApi<SessionState>;
	playlists: StoreApi<PlaylistsState>;
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
					<SetupStandIn
						summary={selection.summary}
						usable={selection.playlist.report.usable}
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
