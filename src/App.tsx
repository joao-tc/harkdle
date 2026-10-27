import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { SessionState } from "@/store/session";
import { LoginScreen } from "@/ui/LoginScreen";
import { SetupErrorScreen } from "@/ui/SetupErrorScreen";
import { SignedInShell } from "@/ui/SignedInShell";

export function App({
	store,
	devUrl,
}: {
	store: StoreApi<SessionState>;
	devUrl: string;
}) {
	const screen = useStore(store, (s) => s.screen);
	const { login, retry, logout } = store.getState();

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
			return <SignedInShell user={screen.user} onLogout={logout} />;
	}
}
