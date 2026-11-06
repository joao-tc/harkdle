import type { GameConfig } from "@/game/config";
import type { Field, Lock, Locks } from "@/game/types";

export function fieldPoints(
	config: GameConfig,
	field: Field,
	lock: Lock,
): number {
	const title = config.titlePoints[lock.step];
	if (field === "title") return title;
	if (field === "album") return title * config.albumRatio;
	const artist = title * config.artistRatio;
	return lock.credit === "featured"
		? artist * config.featuredArtistCredit
		: artist;
}

export interface ScoreModifiers {
	readonly randomStart?: boolean; // false
	readonly paidRerolls?: number; // 0
}

export interface RoundScore {
	readonly fields: Readonly<Partial<Record<Field, number>>>; // exact points of each locked field
	readonly subtotal: number; // sum of fields
	readonly hatTrick: boolean; // every required field locked
	readonly combo: number; // 1, config.combo, or config.comboAlbumSkipped
	readonly modeMultiplier: number; // 1 or config.randomStartMultiplier
	readonly rerollMultiplier: number; // max(floor, 1 − penalty·n)
	readonly total: number; // Math.round(subtotal × combo × mode × reroll), once
}

export function scoreRound(
	config: GameConfig,
	locks: Locks,
	albumSkipped: boolean,
	modifiers: ScoreModifiers = {},
): RoundScore {
	const fields: Partial<Record<Field, number>> = {};
	let subtotal = 0;
	for (const field of ["title", "artist", "album"] as const) {
		const lock = locks[field];
		if (lock) {
			const points = fieldPoints(config, field, lock);
			fields[field] = points;
			subtotal += points;
		}
	}

	const hatTrick =
		locks.title !== undefined &&
		locks.artist !== undefined &&
		(albumSkipped || locks.album !== undefined);
	const combo = !hatTrick
		? 1
		: albumSkipped
			? config.comboAlbumSkipped
			: config.combo;
	const modeMultiplier = modifiers.randomStart
		? config.randomStartMultiplier
		: 1;
	const rerollMultiplier = Math.max(
		config.rerollPenaltyFloor,
		1 - config.rerollPenalty * (modifiers.paidRerolls ?? 0),
	);

	return {
		fields,
		subtotal,
		hatTrick,
		combo,
		modeMultiplier,
		rerollMultiplier,
		total: Math.round(subtotal * combo * modeMultiplier * rerollMultiplier),
	};
}
