import { matchAlbum, matchArtist, matchTitle } from "@/game/match";
import { CLASSIC_START, type RoundStart, type StartWindow } from "@/game/start";
import {
	type Field,
	type Guess,
	LAST_STEP,
	type Lock,
	type Locks,
	type Step,
	type Track,
} from "@/game/types";

export type RoundEnd = "complete" | "out-of-steps" | "gave-up";

export interface RoundState {
	readonly track: Track;
	readonly albumSkipped: boolean;
	readonly step: Step;
	readonly locks: Locks;
	readonly ended: RoundEnd | null;
	readonly startMs: number;
	readonly window: StartWindow | null;
	readonly paidRerolls: number;
}

export type RoundAction =
	| { readonly type: "submit"; readonly guess: Guess }
	| { readonly type: "skip" }
	| { readonly type: "giveUp" };

export function startRound(
	track: Track,
	start: RoundStart = CLASSIC_START,
): RoundState {
	return {
		track,
		albumSkipped: track.album.kind !== "album",
		step: 1,
		locks: {},
		ended: null,
		startMs: start.startMs,
		window: start.window,
		paidRerolls: 0,
	};
}

export function requiredFields(round: RoundState): readonly Field[] {
	return round.albumSkipped
		? ["title", "artist"]
		: ["title", "artist", "album"];
}

function judge(field: Field, value: string, round: RoundState): Lock | null {
	const { step, track } = round;
	switch (field) {
		case "title":
			return matchTitle(value, track) ? { step, credit: "full" } : null;
		case "artist": {
			const match = matchArtist(value, track);
			if (match === null) return null;
			return { step, credit: match === "main" ? "full" : "featured" };
		}
		case "album":
			return matchAlbum(value, track) ? { step, credit: "full" } : null;
	}
}

function advance(state: RoundState, locks: Locks): RoundState {
	return state.step === LAST_STEP
		? { ...state, locks, ended: "out-of-steps" }
		: { ...state, locks, step: (state.step + 1) as Step };
}

function submit(state: RoundState, guess: Guess): RoundState {
	const judged = requiredFields(state).filter(
		(field) => !state.locks[field] && (guess[field]?.trim() ?? "") !== "",
	);
	if (judged.length === 0) return state;

	const locks: Partial<Record<Field, Lock>> = { ...state.locks };
	let anyWrong = false;
	for (const field of judged) {
		const lock = judge(field, guess[field] ?? "", state);
		if (lock) locks[field] = lock;
		else anyWrong = true;
	}

	if (requiredFields(state).every((field) => locks[field])) {
		return { ...state, locks, ended: "complete" };
	}
	return anyWrong ? advance(state, locks) : { ...state, locks };
}

export function roundReducer(
	state: RoundState,
	action: RoundAction,
): RoundState {
	if (state.ended !== null) return state;
	switch (action.type) {
		case "giveUp":
			return { ...state, ended: "gave-up" };
		case "skip":
			return advance(state, state.locks);
		case "submit":
			return submit(state, action.guess);
	}
}
