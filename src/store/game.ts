import type { StoreApi } from "zustand/vanilla";
import { createStore } from "zustand/vanilla";
import { DEFAULT_CONFIG, type GameConfig } from "@/game/config";
import { createGame, type GameState, gameReducer } from "@/game/game";
import { DEFAULT_ROUNDS, pickRounds } from "@/game/presets";
import type { Rng } from "@/game/rng";
import type { RoundAction } from "@/game/round";
import type { Guess } from "@/game/types";
import type { PlaylistTrack } from "@/spotify/clean";
import {
	type InterruptionReason,
	type PlaybackAdapter,
	PlaybackError,
	type PlaybackStatus,
} from "@/spotify/playback/adapter";

// The ui layer may not import from spotify, so it gets these types from here.
export type { InterruptionReason, PlaylistTrack };

export type Recovery = "idle" | "working" | "failed";

export type Stage =
	| "idle"
	| "connecting"
	| "countdown"
	| "round"
	| "reveal"
	| "finished";

/** The adapter status, reduced to what a screen can show. */
export type PlaybackView =
	| { readonly kind: "preparing" } // connecting, idle, cueing, or disconnected before Start
	| { readonly kind: "ready" } // paused at the start point
	| { readonly kind: "playing" } // a clip is running
	| { readonly kind: "revealing" }
	| { readonly kind: "interrupted"; readonly reason: InterruptionReason }; // incl. disconnected after Start

export interface GameStoreDeps {
	readonly adapter: PlaybackAdapter;
	readonly newRng: () => Rng; // one per game
	readonly sleep: (ms: number) => Promise<void>;
	readonly onStartFailed: (error: PlaybackError) => void; // connect rejected
	readonly config?: GameConfig; // DEFAULT_CONFIG
}

export interface GameStoreState {
	readonly stage: Stage;
	readonly game: GameState | null; // non-null from Start until leave()
	readonly revealed: PlaylistTrack | null; // the just-finished round's track, in stage "reveal" and "finished"
	readonly playback: PlaybackView;
	readonly skippedNotice: boolean; // a track failed to cue and was replaced
	readonly countdown: 3 | 2 | 1 | null; // only in stage "countdown"
	readonly recovery: Recovery; // the last "Play here" attempt
	readonly rounds: number; // chosen X
	readonly volume: number; // 0-1

	setRounds(rounds: number): void;
	setVolume(volume: number): void;
	start(tracks: readonly PlaylistTrack[]): Promise<void>; // resolves when stage is "round" or start failed
	play(): void;
	submit(guess: Guess): void;
	skip(): void;
	giveUp(): void;
	next(): void; // reveal -> countdown -> round, or finished after the last round
	recover(): Promise<void>; // resolves when the attempt settled
	dismissNotice(): void;
	playAgain(): Promise<void>; // resolves when stage is "round" or start failed
	leave(): void;
}

export const DEFAULT_VOLUME = 0.8;
export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_TICK_MS = 1000;

const PREPARING: PlaybackView = { kind: "preparing" };
const READY: PlaybackView = { kind: "ready" };
const PLAYING: PlaybackView = { kind: "playing" };
const REVEALING: PlaybackView = { kind: "revealing" };

function viewOf(status: PlaybackStatus, stage: Stage): PlaybackView {
	switch (status.kind) {
		case "disconnected":
			return stage === "idle" || stage === "connecting"
				? PREPARING
				: { kind: "interrupted", reason: "device-lost" };
		case "connecting":
		case "idle":
		case "cueing":
			return PREPARING;
		case "ready":
			return READY;
		case "playing-clip":
			return PLAYING;
		case "revealing":
			return REVEALING;
		case "interrupted":
			return { kind: "interrupted", reason: status.reason };
	}
}

function sameView(a: PlaybackView, b: PlaybackView): boolean {
	if (a.kind !== b.kind) return false;
	return (
		a.kind !== "interrupted" ||
		(b.kind === "interrupted" && a.reason === b.reason)
	);
}

function isSettled(status: PlaybackStatus): boolean {
	return (
		status.kind === "ready" ||
		status.kind === "revealing" ||
		status.kind === "interrupted"
	);
}

function asPlaybackError(error: unknown): PlaybackError {
	if (error instanceof PlaybackError) return error;
	return new PlaybackError(
		"initialization",
		error instanceof Error ? error.message : String(error),
	);
}

type CueOutcome = "ready" | "frozen" | "stale" | "finished";

// "open": actions are accepted. "acting": a submit/skip/give-up follow-up is in flight.
// "waiting": the follow-up returned, the adapter has not reported a settled status yet.
type Gate = "open" | "acting" | "waiting";

export function createGameStore(deps: GameStoreDeps): StoreApi<GameStoreState> {
	const {
		adapter,
		newRng,
		sleep,
		onStartFailed,
		config = DEFAULT_CONFIG,
	} = deps;
	let epoch = 0;
	let gate: Gate = "open";
	let tracksById = new Map<string, PlaylistTrack>();
	let gameTracks: readonly PlaylistTrack[] = [];

	return createStore<GameStoreState>()((set, get) => {
		const enter = (stage: Stage, changes: Partial<GameStoreState> = {}) => {
			set({
				countdown: null,
				...changes,
				stage,
				playback: viewOf(adapter.getStatus(), stage),
			});
		};

		adapter.onStatus((status) => {
			const view = viewOf(status, get().stage);
			if (!sameView(view, get().playback)) set({ playback: view });
			if (gate === "waiting" && isSettled(status)) gate = "open";
		});

		function trackOf(id: string): PlaylistTrack {
			const track = tracksById.get(id);
			if (!track) throw new Error(`unknown track ${id}`);
			return track;
		}

		async function cueCurrent(mine: number): Promise<CueOutcome> {
			for (;;) {
				const { game } = get();
				if (game === null) return "stale";
				if (game.phase !== "round") return "finished";
				const track = trackOf(game.round.track.id);
				try {
					await adapter.cue({ uri: track.uri, startMs: 0 });
					return mine === epoch ? "ready" : "stale";
				} catch (error) {
					// Not a leave, so a superseded cue means the device was taken over.
					if (mine !== epoch) return "stale";
					if (
						!(error instanceof PlaybackError && error.kind === "cue-failed")
					) {
						return "frozen";
					}
					set({
						game: gameReducer(game, { type: "trackFailed" }),
						skippedNotice: true,
					});
				}
			}
		}

		async function begin(tracks: readonly PlaylistTrack[]): Promise<void> {
			const rounds = pickRounds(get().rounds, tracks.length);
			const game = createGame({ tracks, rounds, rng: newRng(), config });
			const mine = ++epoch;
			gate = "open";
			gameTracks = tracks;
			tracksById = new Map(tracks.map((track) => [track.id, track]));
			enter("connecting", {
				game,
				revealed: null,
				skippedNotice: false,
				recovery: "idle",
			});
			try {
				await adapter.connect({ volume: get().volume });
			} catch (error) {
				if (mine !== epoch) return;
				enter("idle", { game: null });
				onStartFailed(asPlaybackError(error));
				return;
			}
			if (mine !== epoch) return;
			const outcome = await cueCurrent(mine);
			if (outcome === "stale") return;
			enter(outcome === "finished" ? "finished" : "round");
		}

		async function followUp(mine: number, work: Promise<void>): Promise<void> {
			// A rejection means the adapter is already interrupted, and the listener shows it.
			await work.catch(() => undefined);
			if (mine !== epoch) return;
			gate = isSettled(adapter.getStatus()) ? "open" : "waiting";
		}

		async function countdown(mine: number): Promise<void> {
			for (const shown of [2, 1, null] as const) {
				await sleep(COUNTDOWN_TICK_MS);
				if (mine !== epoch) return;
				if (shown !== null) set({ countdown: shown });
			}
		}

		async function openNextRound(mine: number): Promise<void> {
			const [outcome] = await Promise.all([cueCurrent(mine), countdown(mine)]);
			if (outcome === "stale" || mine !== epoch) return;
			enter(outcome === "finished" ? "finished" : "round");
		}

		function act(action: RoundAction): void {
			const { stage, game, playback } = get();
			if (stage !== "round" || game?.phase !== "round" || gate !== "open") {
				return;
			}
			if (playback.kind !== "ready" && playback.kind !== "playing") return;
			const next = gameReducer(game, action);
			if (next === game) return;
			gate = "acting";
			if (next.phase === "reveal") {
				enter("reveal", {
					game: next,
					revealed: trackOf(game.round.track.id),
				});
				void followUp(epoch, adapter.reveal());
			} else {
				set({ game: next });
				void followUp(epoch, adapter.stop());
			}
		}

		return {
			stage: "idle",
			game: null,
			revealed: null,
			playback: PREPARING,
			skippedNotice: false,
			countdown: null,
			recovery: "idle",
			rounds: DEFAULT_ROUNDS,
			volume: DEFAULT_VOLUME,

			setRounds(rounds) {
				set({ rounds });
			},

			setVolume(volume) {
				const clamped = Math.min(1, Math.max(0, volume));
				set({ volume: clamped });
				if (adapter.getStatus().kind !== "disconnected") {
					void adapter.setVolume(clamped).catch(() => undefined);
				}
			},

			async start(tracks) {
				if (get().stage !== "idle") return;
				await begin(tracks);
			},

			play() {
				const { stage, game, playback } = get();
				if (stage !== "round" || playback.kind !== "ready") return;
				if (game?.phase !== "round") return;
				const lengthMs = game.config.clipMs[game.round.step];
				void adapter.playClip(lengthMs).catch(() => undefined);
			},

			submit(guess) {
				act({ type: "submit", guess });
			},

			skip() {
				act({ type: "skip" });
			},

			giveUp() {
				act({ type: "giveUp" });
			},

			next() {
				const { stage, game } = get();
				if (stage !== "reveal" || game === null) return;
				// Also drops the follow-up of the reveal that just ended.
				const mine = ++epoch;
				gate = "open";
				const advanced = gameReducer(game, { type: "next" });
				if (advanced.phase === "finished") {
					enter("finished", { game: advanced });
					void adapter.stop().catch(() => undefined);
					return;
				}
				enter("countdown", {
					game: advanced,
					skippedNotice: false,
					countdown: COUNTDOWN_FROM,
				});
				void openNextRound(mine);
			},

			async recover() {
				const { playback, recovery } = get();
				if (playback.kind !== "interrupted" || recovery === "working") return;
				const mine = epoch;
				set({ recovery: "working" });
				try {
					await adapter.recover();
				} catch {
					if (mine === epoch) set({ recovery: "failed" });
					return;
				}
				if (mine !== epoch) return;
				gate = "open";
				set({ recovery: "idle" });
			},

			dismissNotice() {
				if (get().skippedNotice) set({ skippedNotice: false });
			},

			async playAgain() {
				if (get().stage !== "finished") return;
				await begin(gameTracks);
			},

			leave() {
				epoch++;
				gate = "open";
				set({
					stage: "idle",
					game: null,
					revealed: null,
					skippedNotice: false,
					countdown: null,
					recovery: "idle",
					playback: PREPARING,
				});
				adapter.disconnect();
			},
		};
	});
}
