export interface CueTarget {
	readonly uri: string;
	readonly startMs: number; // the round's stored start point
}

export type InterruptionReason = "device-lost" | "taken-over";

export type PlaybackStatus =
	| { readonly kind: "disconnected" }
	| { readonly kind: "connecting" }
	| { readonly kind: "idle" } // connected, nothing cued
	| { readonly kind: "cueing"; readonly target: CueTarget } // first cue and every re-cue
	| { readonly kind: "ready"; readonly target: CueTarget } // paused at the start point, confirmed
	| { readonly kind: "playing-clip"; readonly target: CueTarget }
	| { readonly kind: "revealing"; readonly target: CueTarget }
	| {
			readonly kind: "interrupted";
			readonly reason: InterruptionReason;
			readonly target: CueTarget | null;
	  };

export type ClipOutcome =
	| { readonly kind: "ended" } // reached origin + lengthMs
	| { readonly kind: "stopped" } // stop() or a new cue()
	| { readonly kind: "hidden" } // tab hidden
	| { readonly kind: "revealed" } // reveal() dropped the end bound
	| { readonly kind: "interrupted"; readonly reason: InterruptionReason };

export type PlaybackErrorKind =
	| "sdk-load"
	| "initialization"
	| "authentication"
	| "account"
	| "device-lost"
	| "cue-failed"
	| "not-connected"
	| "superseded";

export class PlaybackError extends Error {
	readonly kind: PlaybackErrorKind;

	constructor(kind: PlaybackErrorKind, message: string) {
		super(message);
		this.name = "PlaybackError";
		this.kind = kind;
	}
}

export interface PlaybackAdapter {
	getStatus(): PlaybackStatus;
	onStatus(listener: (status: PlaybackStatus) => void): () => void; // returns unsubscribe
	/** Must run from a user gesture (Start). Idempotent. Rejects with PlaybackError. */
	connect(options: { readonly volume: number }): Promise<void>;
	disconnect(): void;
	/** Stops anything playing, then cues muted. Resolves at status `ready`. */
	cue(target: CueTarget): Promise<void>;
	/** Resolves when the clip ends, was stopped, hidden, revealed or interrupted. */
	playClip(lengthMs: number): Promise<ClipOutcome>;
	/** Continues a playing clip unbounded, or starts from the start point. Resolves once audible. */
	reveal(): Promise<void>;
	/** Stops a clip or reveal, then re-cues to the start point. No-op when idle or ready. */
	stop(): Promise<void>;
	/** 0–1, clamped, remembered. Applied after the cue's mute if one is running. */
	setVolume(volume: number): Promise<void>;
	/** "Play here": reconnect if needed, transfer playback, re-cue the target. */
	recover(): Promise<void>;
}
