export type Rng = () => number;

export function createRng(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function swap<T>(items: T[], i: number, j: number): void {
	// splice keeps element types as T, which indexed access would widen to T | undefined
	items.splice(j, 1, ...items.splice(i, 1, ...items.slice(j, j + 1)));
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		swap(out, i, Math.floor(rng() * (i + 1)));
	}
	return out;
}
