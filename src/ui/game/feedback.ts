import type { GameState } from "@/game/game";
import { type RoundState, requiredFields } from "@/game/round";
import type { Field, Guess } from "@/game/types";

/**
 * The fields of `submitted` that were judged and did not lock: picked, non-blank, asked for,
 * and still unlocked in the round `after` the submission. Empty when the round did not continue
 * (it completed, ran out of steps, or ended). It compares locks and never re-matches text.
 */
export function wrongFields(
	submitted: Guess,
	before: RoundState,
	after: GameState,
): readonly Field[] {
	if (after.phase !== "round") return [];
	return requiredFields(before).filter(
		(field) =>
			(submitted[field]?.trim() ?? "") !== "" &&
			after.round.locks[field] === undefined,
	);
}
