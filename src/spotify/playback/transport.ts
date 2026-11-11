export interface TransportState {
	readonly positionMs: number;
	readonly paused: boolean;
	readonly uri: string | null;
	readonly linkedFromUri: string | null; // set when Spotify relinked the track
}

export type TransportEvent =
	| { readonly type: "state"; readonly state: TransportState | null } // null: the SDK reports no playback
	| { readonly type: "not-ready" } // the device went offline
	| {
			readonly type: "error";
			readonly kind:
				| "initialization"
				| "authentication"
				| "account"
				| "playback";
			readonly message: string;
	  };

export type TransportErrorKind =
	| "device-gone"
	| "not-connected"
	| "request-failed";

export class TransportError extends Error {
	readonly kind: TransportErrorKind; // "device-gone" = play/transfer answered 404

	constructor(kind: TransportErrorKind, message: string) {
		super(message);
		this.name = "TransportError";
		this.kind = kind;
	}
}

export interface PlayerTransport {
	/** Loads the SDK, creates the device, waits for `ready`, transfers playback (play: false). Rejects with PlaybackError. */
	connect(options: { readonly volume: number }): Promise<void>;
	disconnect(): void;
	transferHere(): Promise<void>; // PUT /me/player, play: false
	playFrom(uri: string, positionMs: number): Promise<void>; // PUT /me/player/play on our device
	pause(): Promise<void>; // SDK call; resolves whether or not it took effect
	pauseViaApi(): Promise<void>; // PUT /me/player/pause
	resume(): Promise<void>;
	seek(positionMs: number): Promise<void>; // SDK call
	seekViaApi(positionMs: number): Promise<void>; // PUT /me/player/seek
	getState(): Promise<TransportState | null>;
	setVolume(volume: number): Promise<void>; // SDK setVolume, 0–1
	getVolume(): Promise<number>; // SDK getVolume
	subscribe(listener: (event: TransportEvent) => void): () => void;
}
