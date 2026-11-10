// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SpotifyAttribution } from "@/ui/SpotifyAttribution";

afterEach(cleanup);

describe("SpotifyAttribution", () => {
	it("renders a footer containing the logo image and the attribution text", () => {
		render(<SpotifyAttribution />);

		const footer = screen.getByRole("contentinfo");
		const logo = screen.getByRole("img", { name: "Spotify" });
		expect(footer.contains(logo)).toBe(true);
		expect(
			footer.contains(
				screen.getByText("Playlist data and artwork from Spotify"),
			),
		).toBe(true);
	});

	it("uses the provided SVG as a real img", () => {
		render(<SpotifyAttribution />);

		const logo = screen.getByRole("img", { name: "Spotify" });
		expect(logo.tagName).toBe("IMG");
		expect(logo.getAttribute("src")).toBeTruthy();
	});

	it("sizes the logo at w-24 (96px), at least the 70px minimum", () => {
		render(<SpotifyAttribution />);

		const logo = screen.getByRole("img", { name: "Spotify" });
		// jsdom has no layout; w-24 is 6rem = 96px >= 70px.
		expect(logo.classList.contains("w-24")).toBe(true);
	});

	it("keeps clear space around the logo and nothing positioned over it", () => {
		render(<SpotifyAttribution />);

		const footer = screen.getByRole("contentinfo");
		const logo = screen.getByRole("img", { name: "Spotify" });
		// p-4 / gap-4 = 16px >= half the ~26px icon height.
		expect(footer.classList.contains("p-4")).toBe(true);
		expect(footer.classList.contains("gap-4")).toBe(true);
		expect(logo.parentElement).toBe(footer);
		expect(footer.querySelectorAll("img")).toHaveLength(1);
		expect(logo.className).not.toMatch(/absolute|fixed|relative/);
	});
});
