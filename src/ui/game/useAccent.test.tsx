// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_ACCENT } from "./accent";
import { useAccent } from "./useAccent";

afterEach(cleanup);

type Pixels = Uint8ClampedArray | null;

function deferred() {
	let resolve: (pixels: Pixels) => void = () => {};
	const promise = new Promise<Pixels>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const solid = (r: number, g: number, b: number) =>
	new Uint8ClampedArray(
		Array.from({ length: 16 }, () => [r, g, b, 255]).flat(),
	);

const settle = () => act(async () => {});

describe("useAccent", () => {
	it("is the fallback and loads nothing without a cover", async () => {
		const load = vi.fn<(url: string) => Promise<Pixels>>();
		const { result } = renderHook(() => useAccent(null, load));
		await settle();
		expect(result.current.color).toBe(FALLBACK_ACCENT);
		expect(load).not.toHaveBeenCalled();
	});

	it("starts at the fallback and swaps to the extracted accent once", async () => {
		const pending = deferred();
		const load = vi.fn(() => pending.promise);
		const { result } = renderHook(() => useAccent("https://img/a", load));
		expect(result.current.color).toBe(FALLBACK_ACCENT);

		await act(async () => pending.resolve(solid(255, 0, 0)));
		expect(result.current.color).toBe("#e60000");
		expect(load).toHaveBeenCalledTimes(1);
		expect(load).toHaveBeenCalledWith("https://img/a");
	});

	it("stays on the fallback when the pixels cannot be read", async () => {
		const load = vi.fn(async (): Promise<Pixels> => null);
		const { result } = renderHook(() => useAccent("https://img/a", load));
		await settle();
		expect(result.current.color).toBe(FALLBACK_ACCENT);
	});

	it("stays on the fallback when loading throws", async () => {
		const load = vi.fn(async (): Promise<Pixels> => {
			throw new Error("boom");
		});
		const { result } = renderHook(() => useAccent("https://img/a", load));
		await settle();
		expect(result.current.color).toBe(FALLBACK_ACCENT);
	});

	it("discards the result of an earlier URL", async () => {
		const first = deferred();
		const second = deferred();
		const load = vi.fn((url: string) =>
			url.endsWith("a") ? first.promise : second.promise,
		);
		const { result, rerender } = renderHook(({ url }) => useAccent(url, load), {
			initialProps: { url: "https://img/a" },
		});
		rerender({ url: "https://img/b" });

		await act(async () => first.resolve(solid(255, 0, 0)));
		expect(result.current.color).toBe(FALLBACK_ACCENT);

		await act(async () => second.resolve(solid(0, 0, 255)));
		expect(result.current.color).toBe("#0000e6");
	});

	it("falls back again when the cover goes away", async () => {
		const load = vi.fn(async (): Promise<Pixels> => solid(255, 0, 0));
		const { result, rerender } = renderHook(
			({ url }: { url: string | null }) => useAccent(url, load),
			{ initialProps: { url: "https://img/a" as string | null } },
		);
		await settle();
		expect(result.current.color).toBe("#e60000");

		rerender({ url: null });
		expect(result.current.color).toBe(FALLBACK_ACCENT);
	});

	it("does not reload when only the loader's identity changes", async () => {
		const load = vi.fn(
			async (_url: string): Promise<Pixels> => solid(255, 0, 0),
		);
		const { rerender } = renderHook(() =>
			useAccent("https://img/a", (url) => load(url)),
		);
		await settle();
		rerender();
		await settle();
		expect(load).toHaveBeenCalledTimes(1);
	});
});
