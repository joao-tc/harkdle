import type { GameConfig } from "@/game/config";
import type { Rng } from "@/game/rng";

export interface StartWindow {
	readonly minMs: number;
	readonly maxMs: number;
}

export interface RoundStart {
	readonly startMs: number;
	readonly window: StartWindow | null;
}

export const CLASSIC_START: RoundStart = { startMs: 0, window: null };

export function startWindow(
	durationMs: number,
	config: GameConfig,
): StartWindow | null {
	// The epsilon keeps 0.1 * 70 = 7.000000000000001 from rounding up to 8.
	const minMs = Math.ceil(config.startMinRatio * durationMs - 1e-9);
	const maxMs = durationMs - config.startTailMs;
	return minMs > maxMs ? null : { minMs, maxMs };
}

export function drawStart(
	durationMs: number,
	rng: Rng,
	config: GameConfig,
): RoundStart {
	const window = startWindow(durationMs, config);
	if (window === null) return CLASSIC_START;
	const size = window.maxMs - window.minMs + 1;
	return { startMs: window.minMs + Math.floor(rng() * size), window };
}

function rerollParts(
	start: RoundStart,
	config: GameConfig,
): { low: number; high: number } {
	const { window, startMs } = start;
	if (window === null) return { low: 0, high: 0 };
	const d = config.rerollMinDistanceMs;
	return {
		low: Math.max(0, startMs - d - window.minMs + 1),
		high: Math.max(0, window.maxMs - (startMs + d) + 1),
	};
}

export function canReroll(start: RoundStart, config: GameConfig): boolean {
	const { low, high } = rerollParts(start, config);
	return low + high > 0;
}

export function drawReroll(
	start: RoundStart,
	rng: Rng,
	config: GameConfig,
): RoundStart | null {
	const { window } = start;
	if (window === null) return null;
	const { low, high } = rerollParts(start, config);
	const total = low + high;
	if (total === 0) return null;
	const r = Math.floor(rng() * total);
	const startMs =
		r < low
			? window.minMs + r
			: start.startMs + config.rerollMinDistanceMs + (r - low);
	return { startMs, window };
}
