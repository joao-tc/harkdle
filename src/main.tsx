import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { checkAccount } from "@/spotify/account";
import { createSpotifyApi } from "@/spotify/api";
import { createAuth, redirectUriFor } from "@/spotify/auth";
import { createPlaylistsClient } from "@/spotify/playlists";
import { createPlaylistsStore } from "@/store/playlists";
import { createSessionStore } from "@/store/session";
import { connectPlaylistsToSession, signedInUserId } from "@/store/wiring";
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

void session.getState().boot();

createRoot(rootElement).render(
	<StrictMode>
		<App
			session={session}
			playlists={playlists}
			devUrl={`${location.protocol}//127.0.0.1:${location.port}`}
		/>
	</StrictMode>,
);
