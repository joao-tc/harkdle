const SIZE = 32;

/**
 * The cover's pixels, downsampled to SIZE × SIZE, or null when they cannot be read (L6, D8).
 * The cover is loaded again on an off-screen Image with CORS so the canvas stays readable; the
 * visible <img> is never drawn on. Any failure (network, CORS, a tainted canvas) resolves null.
 *
 * Not unit tested: jsdom has no canvas and no image decoding. The live check records whether
 * `i.scdn.co` allows the CORS load, which is the part that can only be settled in a real browser.
 */
export function loadPixels(url: string): Promise<Uint8ClampedArray | null> {
	return new Promise((resolve) => {
		const image = new Image();
		image.crossOrigin = "anonymous";
		image.onerror = () => resolve(null);
		image.onload = () => {
			try {
				const canvas = document.createElement("canvas");
				canvas.width = SIZE;
				canvas.height = SIZE;
				const context = canvas.getContext("2d", { willReadFrequently: true });
				if (context === null) {
					resolve(null);
					return;
				}
				context.drawImage(image, 0, 0, SIZE, SIZE);
				resolve(context.getImageData(0, 0, SIZE, SIZE).data);
			} catch {
				resolve(null);
			}
		};
		image.src = url;
	});
}
