import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRng } from "@/game/rng";
import { checkAccount } from "@/spotify/account";
import { createSpotifyApi } from "@/spotify/api";
import { createAuth, redirectUriFor } from "@/spotify/auth";
import { createPlaybackAdapter } from "@/spotify/playback/engine";
import { createSdkTransport } from "@/spotify/playback/sdk/transport";
import { documentVisibility } from "@/spotify/playback/visibility";
import { createPlaylistsClient } from "@/spotify/playlists";
import { createGameStore } from "@/store/game";
import { connectLeaveGuard } from "@/store/leaveGuard";
import { createPlaylistsStore } from "@/store/playlists";
import { createSessionStore } from "@/store/session";
import {
	connectGameToSession,
	connectPlaylistsToSession,
	signedInUserId,
} from "@/store/wiring";
import { App } from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const fetchFn = (
	url: string,
	init: { method: string; headers: Record<string, string>; body?: string },
) => fetch(url, init);

const auth = createAuth({
	clientId: clientId ?? "",
	redirectUri: redirectUriFor(
		location,
		import.meta.env.BASE_URL,
		import.meta.env.DEV,
	),
	fetchFn,
	now: () => Date.now(),
	randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
	store: localStorage,
	navigate: (url) => location.assign(url),
	replaceUrl: () => history.replaceState({}, "", import.meta.env.BASE_URL),
});

const session = createSessionStore({
	auth,
	checkAccount: () =>
		checkAccount({ getAccessToken: () => auth.getAccessToken(), fetchFn }),
	env: { clientId, dev: import.meta.env.DEV, hostname: location.hostname },
	search: location.search,
});

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

const api = createSpotifyApi({
	getAccessToken: () => auth.getAccessToken(),
	fetchFn,
	sleep,
});

const playlists = createPlaylistsStore({
	client: createPlaylistsClient(api),
	getUserId: () => signedInUserId(session),
	onUnauthorized: () => session.getState().expire(),
});

connectPlaylistsToSession(session, playlists);

// The one place the real player is built: the SDK transport behind the playback adapter, under the game store.
const adapter = createPlaybackAdapter({
	transport: createSdkTransport({
		getAccessToken: () => auth.getAccessToken(),
		api,
	}),
	clock: { now: () => performance.now(), sleep },
	visibility: documentVisibility(document),
});

const game = createGameStore({
	adapter,
	sleep,
	newRng: () => createRng(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1),
	onStartFailed: (error) =>
		session
			.getState()
			.playerFailed({ kind: error.kind, message: error.message }),
});

connectGameToSession(session, game);
connectLeaveGuard(game, window);

void session.getState().boot();

createRoot(rootElement).render(
	<StrictMode>
		<App
			session={session}
			playlists={playlists}
			game={game}
			devUrl={`${location.protocol}//127.0.0.1:${location.port}`}
		/>
	</StrictMode>,
);
