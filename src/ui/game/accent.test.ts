import { describe, expect, it } from "vitest";
import { accentFromPixels, FALLBACK_ACCENT } from "./accent";

function solid(r: number, g: number, b: number, a = 255, count = 16) {
	const out = new Uint8ClampedArray(count * 4);
	for (let i = 0; i < count; i++) out.set([r, g, b, a], i * 4);
	return out;
}

function lightnessOf(color: string): number {
	const n = Number.parseInt(color.slice(1), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(
		(c) => c / 255,
	);
	return (
		(Math.max(r ?? 0, g ?? 0, b ?? 0) + Math.min(r ?? 0, g ?? 0, b ?? 0)) / 2
	);
}

describe("accentFromPixels", () => {
	it("uses Spotify's documented fallback colour", () => {
		expect(FALLBACK_ACCENT).toBe("#191414");
	});

	it("keeps the hue of a solid colour and clamps it into the band", () => {
		const accent = accentFromPixels(solid(255, 0, 0));
		expect(accent).toEqual({ color: "#e60000", onColor: "light" });
	});

	it("gives a stable result for the same pixels", () => {
		expect(accentFromPixels(solid(30, 120, 200))).toEqual(
			accentFromPixels(solid(30, 120, 200)),
		);
	});

	it("does not produce an unreadable accent for a solid white cover", () => {
		const accent = accentFromPixels(solid(255, 255, 255));
		expect(accent).not.toBeNull();
		expect(lightnessOf(accent?.color ?? "#fff")).toBeLessThanOrEqual(0.46);
		expect(accent?.onColor).toBe("light");
	});

	it("does not produce an unreadable accent for a solid black cover", () => {
		const accent = accentFromPixels(solid(0, 0, 0));
		expect(accent).not.toBeNull();
		expect(lightnessOf(accent?.color ?? "#000")).toBeGreaterThanOrEqual(0.19);
		expect(accent?.onColor).toBe("light");
	});

	it("averages a grey cover to a grey accent", () => {
		const accent = accentFromPixels(solid(128, 128, 128));
		expect(accent?.color).toMatch(/^#([0-9a-f]{2})\1\1$/);
	});

	it("lets a vivid detail beat a grey background", () => {
		const pixels = new Uint8ClampedArray(16 * 4);
		for (let i = 0; i < 16; i++) {
			pixels.set(i < 14 ? [128, 128, 128, 255] : [0, 0, 255, 255], i * 4);
		}
		const color = accentFromPixels(pixels)?.color ?? "";
		const blue = Number.parseInt(color.slice(5, 7), 16);
		const red = Number.parseInt(color.slice(1, 3), 16);
		expect(blue).toBeGreaterThan(red);
	});

	it("picks dark text on a colour that is still bright after clamping", () => {
		// A saturated yellow at the top of the band is bright enough for dark text.
		const accent = accentFromPixels(solid(255, 255, 0));
		expect(accent?.onColor).toBe("dark");
	});

	it("returns null for an empty array", () => {
		expect(accentFromPixels(new Uint8ClampedArray(0))).toBeNull();
	});

	it("returns null when every pixel is transparent", () => {
		expect(accentFromPixels(solid(255, 0, 0, 0))).toBeNull();
	});

	it("ignores the transparent pixels among opaque ones", () => {
		const pixels = new Uint8ClampedArray(8);
		pixels.set([255, 0, 0, 0], 0);
		pixels.set([0, 0, 255, 255], 4);
		const color = accentFromPixels(pixels)?.color ?? "";
		expect(Number.parseInt(color.slice(5, 7), 16)).toBeGreaterThan(
			Number.parseInt(color.slice(1, 3), 16),
		);
	});
});
