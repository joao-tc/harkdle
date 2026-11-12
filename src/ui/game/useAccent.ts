import { useEffect, useRef, useState } from "react";
import {
	type Accent,
	accentFromPixels,
	FALLBACK_ACCENT,
} from "@/ui/game/accent";
import { loadPixels } from "@/ui/game/accentSource";

const FALLBACK: Accent = { color: FALLBACK_ACCENT, onColor: "light" };

/**
 * The page accent for a cover: the fallback first (and always, when there is no cover or it
 * cannot be read), then the extracted colour, swapped in once. A result for an earlier URL is dropped.
 */
export function useAccent(
	coverUrl: string | null,
	load: (url: string) => Promise<Uint8ClampedArray | null> = loadPixels,
): Accent {
	const [result, setResult] = useState<{ url: string; accent: Accent } | null>(
		null,
	);
	const loadRef = useRef(load);
	loadRef.current = load;

	useEffect(() => {
		if (coverUrl === null) return;
		let stale = false;
		const settle = (accent: Accent) => {
			if (!stale) setResult({ url: coverUrl, accent });
		};
		loadRef
			.current(coverUrl)
			.then((pixels) => {
				settle((pixels && accentFromPixels(pixels)) ?? FALLBACK);
			})
			.catch(() => settle(FALLBACK));
		return () => {
			stale = true;
		};
	}, [coverUrl]);

	return coverUrl !== null && result?.url === coverUrl
		? result.accent
		: FALLBACK;
}
