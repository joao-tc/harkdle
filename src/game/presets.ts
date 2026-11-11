export const ROUND_PRESETS = [5, 10, 20] as const;
export const DEFAULT_ROUNDS = 10;

export interface PresetOption {
	readonly rounds: number;
	readonly enabled: boolean;
}

export function presetOptions(usable: number): readonly PresetOption[] {
	return ROUND_PRESETS.map((rounds) => ({ rounds, enabled: rounds <= usable }));
}

/** `chosen` if it is an enabled preset, else the largest enabled preset. */
export function pickRounds(chosen: number, usable: number): number {
	const enabled = presetOptions(usable).filter((o) => o.enabled);
	if (enabled.some((o) => o.rounds === chosen)) return chosen;
	const largest = enabled[enabled.length - 1];
	if (largest === undefined) {
		throw new RangeError(
			`no round preset fits ${usable} usable tracks (minimum ${ROUND_PRESETS[0]})`,
		);
	}
	return largest.rounds;
}
