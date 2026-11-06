import type { Step } from "@/game/types";

export interface GameConfig {
	readonly clipMs: Readonly<Record<Step, number>>; // 1000, 2000, 4000, 7000, 11000, 16000
	readonly titlePoints: Readonly<Record<Step, number>>; // 1000, 800, 600, 400, 250, 100
	readonly artistRatio: number; // 0.3 of the title points for the same step
	readonly albumRatio: number; // 0.5
	readonly featuredArtistCredit: number; // 0.5 of the artist points
	readonly combo: number; // 1.5
	readonly comboAlbumSkipped: number; // 2.0
	readonly randomStartMultiplier: number; // 1.25
	readonly rerollPenalty: number; // 0.1 per paid reroll
	readonly rerollPenaltyFloor: number; // 0.5
}

export const DEFAULT_CONFIG: GameConfig = {
	clipMs: { 1: 1000, 2: 2000, 3: 4000, 4: 7000, 5: 11000, 6: 16000 },
	titlePoints: { 1: 1000, 2: 800, 3: 600, 4: 400, 5: 250, 6: 100 },
	artistRatio: 0.3,
	albumRatio: 0.5,
	featuredArtistCredit: 0.5,
	combo: 1.5,
	comboAlbumSkipped: 2.0,
	randomStartMultiplier: 1.25,
	rerollPenalty: 0.1,
	rerollPenaltyFloor: 0.5,
};
