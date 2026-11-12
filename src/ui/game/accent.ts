// Spotify's documented fallback when no colour can be taken from the artwork (L5, L6).
export const FALLBACK_ACCENT = "#191414";

export interface Accent {
	readonly color: string; // "#rrggbb"
	/** The colour of the text and icons that sit on `color`. */
	readonly onColor: "light" | "dark";
}

// The accent is a page background under light text, so it stays in a band that reads on the dark theme.
const MIN_LIGHTNESS = 0.2;
const MAX_LIGHTNESS = 0.45;
const MIN_ALPHA = 16;

interface Hsl {
	readonly h: number; // 0-360
	readonly s: number; // 0-1
	readonly l: number; // 0-1
}

function toHsl(r: number, g: number, b: number): Hsl {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return { h: 0, s: 0, l };
	const s = d / (1 - Math.abs(2 * l - 1));
	let h: number;
	if (max === r) h = ((g - b) / d) % 6;
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return { h: (h * 60 + 360) % 360, s, l };
}

type Rgb = [number, number, number];

function toRgb({ h, s, l }: Hsl): Rgb {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const sector = Math.floor(h / 60) % 6;
	const sectors: readonly Rgb[] = [
		[c, x, 0],
		[x, c, 0],
		[0, c, x],
		[0, x, c],
		[x, 0, c],
		[c, 0, x],
	];
	const [r, g, b] = sectors[sector] ?? [0, 0, 0];
	return [r + m, g + m, b + m];
}

const hex = (channel: number): string =>
	Math.round(Math.min(1, Math.max(0, channel)) * 255)
		.toString(16)
		.padStart(2, "0");

const linear = (channel: number): number =>
	channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

function luminance([r, g, b]: Rgb): number {
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The cover's colour, as a page accent: pixels averaged and weighted by their saturation
 * (so a vivid detail beats a grey background), lightness clamped into a band that reads on
 * the dark theme. `null` when there is no opaque pixel to read.
 */
export function accentFromPixels(rgba: Uint8ClampedArray): Accent | null {
	let weight = 0;
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	let plainCount = 0;
	let plainR = 0;
	let plainG = 0;
	let plainB = 0;
	for (let i = 0; i + 3 < rgba.length; i += 4) {
		if ((rgba[i + 3] ?? 0) < MIN_ALPHA) continue;
		const r = (rgba[i] ?? 0) / 255;
		const g = (rgba[i + 1] ?? 0) / 255;
		const b = (rgba[i + 2] ?? 0) / 255;
		plainCount++;
		plainR += r;
		plainG += g;
		plainB += b;
		const w = toHsl(r, g, b).s;
		weight += w;
		sumR += r * w;
		sumG += g * w;
		sumB += b * w;
	}
	if (plainCount === 0) return null;

	// All grey: no saturation to weigh by, so the plain average stands.
	const average: Rgb =
		weight > 1e-6
			? [sumR / weight, sumG / weight, sumB / weight]
			: [plainR / plainCount, plainG / plainCount, plainB / plainCount];
	const { h, s, l } = toHsl(...average);
	const rgb = toRgb({
		h,
		s,
		l: Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l)),
	});
	// Contrast with white vs. with black: light text wins until the colour is brighter than ~0.18.
	const onColor = luminance(rgb) > 0.179 ? "dark" : "light";
	return { color: `#${rgb.map(hex).join("")}`, onColor };
}
