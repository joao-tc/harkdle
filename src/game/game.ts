import { DEFAULT_CONFIG, type GameConfig } from "@/game/config";
import { type Rng, shuffle } from "@/game/rng";
import {
	type RoundAction,
	type RoundEnd,
	type RoundState,
	roundReducer,
	startRound,
} from "@/game/round";
import { type RoundScore, scoreRound } from "@/game/scoring";
import {
	CLASSIC_START,
	canReroll,
	drawReroll,
	drawStart,
	type RoundStart,
} from "@/game/start";
import type { Locks, StartMode, Step, TimedTrack, Track } from "@/game/types";

export interface RoundResult {
	readonly track: Track;
	readonly albumSkipped: boolean;
	readonly locks: Locks;
	readonly endedBy: RoundEnd;
	readonly score: RoundScore;
}

interface GameBase {
	readonly config: GameConfig;
	readonly rounds: number;
	readonly queue: readonly TimedTrack[];
	readonly cursor: number;
	readonly results: readonly RoundResult[];
	readonly startMode: StartMode;
	readonly rerollsUsed: number;
	readonly rng: Rng;
}

export type GameState = GameBase &
	(
		| { readonly phase: "round"; readonly round: RoundState }
		| { readonly phase: "reveal" }
		| { readonly phase: "finished" }
	);

export type GameAction =
	| RoundAction
	| { readonly type: "next" }
	| { readonly type: "trackFailed" }
	| { readonly type: "reroll" };

export function createGame(options: {
	readonly tracks: readonly TimedTrack[];
	readonly rounds: number;
	readonly rng: Rng;
	readonly config?: GameConfig;
	readonly startMode?: StartMode;
}): GameState {
	const {
		tracks,
		rounds,
		rng,
		config = DEFAULT_CONFIG,
		startMode = "classic",
	} = options;
	if (!Number.isInteger(rounds) || rounds < 1 || rounds > tracks.length) {
		throw new RangeError(
			`rounds must be an integer between 1 and ${tracks.length}, got ${rounds}`,
		);
	}
	const queue = shuffle(tracks, rng);
	const [first] = queue;
	if (!first) throw new RangeError("tracks must not be empty");
	return {
		config,
		rounds,
		queue,
		cursor: 0,
		results: [],
		startMode,
		rerollsUsed: 0,
		rng,
		phase: "round",
		round: startRound(first, pickStart(startMode, first, rng, config)),
	};
}

function pickStart(
	startMode: StartMode,
	track: TimedTrack,
	rng: Rng,
	config: GameConfig,
): RoundStart {
	return startMode === "random"
		? drawStart(track.durationMs, rng, config)
		: CLASSIC_START;
}

// Rebuilt field by field so a phase change never carries a stale `round` key.
function rebase(
	state: GameBase,
	changes: {
		readonly cursor?: number;
		readonly results?: readonly RoundResult[];
		readonly rerollsUsed?: number;
	},
): GameBase {
	return {
		config: state.config,
		rounds: state.rounds,
		queue: state.queue,
		cursor: changes.cursor ?? state.cursor,
		results: changes.results ?? state.results,
		startMode: state.startMode,
		rerollsUsed: changes.rerollsUsed ?? state.rerollsUsed,
		rng: state.rng,
	};
}

function playTrackAt(state: GameBase, cursor: number): GameState {
	const base = rebase(state, { cursor });
	const track = base.queue[cursor];
	return track
		? {
				...base,
				phase: "round",
				round: startRound(
					track,
					pickStart(base.startMode, track, base.rng, base.config),
				),
			}
		: { ...base, phase: "finished" };
}

function reroll(state: Extract<GameState, { phase: "round" }>): GameState {
	const { round, config } = state;
	if (state.startMode !== "random" || round.ended !== null) return state;
	const start = drawReroll(round, state.rng, config);
	if (start === null) return state;
	const paid = state.rerollsUsed >= config.freeRerolls ? 1 : 0;
	return {
		...rebase(state, { rerollsUsed: state.rerollsUsed + 1 }),
		phase: "round",
		round: {
			...round,
			startMs: start.startMs,
			paidRerolls: round.paidRerolls + paid,
		},
	};
}

function playRound(
	state: Extract<GameState, { phase: "round" }>,
	action: RoundAction,
): GameState {
	const round = roundReducer(state.round, action);
	if (round === state.round) return state;
	if (round.ended === null) {
		return { ...rebase(state, {}), phase: "round", round };
	}
	const result: RoundResult = {
		track: round.track,
		albumSkipped: round.albumSkipped,
		locks: round.locks,
		endedBy: round.ended,
		score: scoreRound(state.config, round.locks, round.albumSkipped, {
			randomStart: state.startMode === "random",
			paidRerolls: round.paidRerolls,
		}),
	};
	return {
		...rebase(state, { results: [...state.results, result] }),
		phase: "reveal",
	};
}

export function gameReducer(state: GameState, action: GameAction): GameState {
	switch (state.phase) {
		case "round":
			if (action.type === "trackFailed") {
				return playTrackAt(state, state.cursor + 1);
			}
			if (action.type === "next") return state;
			if (action.type === "reroll") return reroll(state);
			return playRound(state, action);
		case "reveal":
			if (action.type !== "next") return state;
			if (state.results.length >= state.rounds) {
				return { ...rebase(state, {}), phase: "finished" };
			}
			return playTrackAt(state, state.cursor + 1);
		case "finished":
			return state;
	}
}

export function rerollStatus(state: GameState): {
	available: boolean;
	freeLeft: number;
	nextIsPaid: boolean;
} {
	const { config, rerollsUsed } = state;
	return {
		available:
			state.phase === "round" &&
			state.startMode === "random" &&
			canReroll(state.round, config),
		freeLeft: Math.max(0, config.freeRerolls - rerollsUsed),
		nextIsPaid: rerollsUsed >= config.freeRerolls,
	};
}

export interface GameSummary {
	readonly score: number;
	readonly stepHistogram: Readonly<Record<Step, number>>;
	readonly missed: number;
	readonly hatTricks: number;
	readonly roundsPlayed: number;
}

export function summarize(state: GameState): GameSummary {
	const stepHistogram: Record<Step, number> = {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0,
		6: 0,
	};
	let score = 0;
	let missed = 0;
	let hatTricks = 0;
	for (const result of state.results) {
		score += result.score.total;
		if (result.score.hatTrick) hatTricks++;
		const step = result.locks.title?.step;
		if (step === undefined) missed++;
		else stepHistogram[step]++;
	}
	return {
		score,
		stepHistogram,
		missed,
		hatTricks,
		roundsPlayed: state.results.length,
	};
}
