import { PlaybackError } from "../adapter";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const DEFAULT_TIMEOUT_MS = 10_000;

export interface LoadSdkDeps {
	document?: Document;
	window?: Window & typeof globalThis;
	timeoutMs?: number;
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
}

let pending: Promise<void> | null = null;

export function loadSdk(deps: LoadSdkDeps = {}): Promise<void> {
	const doc = deps.document ?? document;
	const win = deps.window ?? window;
	if (win.Spotify) return Promise.resolve();
	if (pending) return pending;

	const startTimer = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
	const stopTimer =
		deps.clearTimeout ??
		((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

	const promise = new Promise<void>((resolve, reject) => {
		const script = doc.createElement("script");
		script.src = SDK_URL;
		script.async = true;
		let settled = false;

		const settle = (error?: PlaybackError) => {
			if (settled) return;
			settled = true;
			stopTimer(timer);
			pending = null;
			if (error) {
				script.remove();
				reject(error);
			} else {
				resolve();
			}
		};

		const timer = startTimer(
			() => settle(new PlaybackError("sdk-load", "Spotify SDK load timed out")),
			deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		);
		win.onSpotifyWebPlaybackSDKReady = () => settle();
		script.addEventListener("error", () =>
			settle(
				new PlaybackError("sdk-load", "Spotify SDK script failed to load"),
			),
		);
		doc.head.append(script);
	});
	pending = promise;
	return promise;
}
