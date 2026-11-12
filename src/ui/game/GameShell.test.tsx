// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GameShell } from "./GameShell";

afterEach(cleanup);

describe("GameShell", () => {
	it("renders the children with the Spotify logo and the attribution line", () => {
		render(
			<GameShell>
				<p>content</p>
			</GameShell>,
		);
		expect(screen.getByText("content")).toBeTruthy();
		expect(screen.getByRole("img", { name: "Spotify" })).toBeTruthy();
		expect(
			screen.getByText("Track data and artwork from Spotify"),
		).toBeTruthy();
	});

	it("keeps the logo at least 70px wide and clear of the content", () => {
		render(
			<GameShell>
				<p>content</p>
			</GameShell>,
		);
		const logo = screen.getByRole("img", { name: "Spotify" });
		expect(logo.classList.contains("w-24")).toBe(true);
		expect(screen.getByText("content").contains(logo)).toBe(false);
	});

	it("sets the accent variables when given an accent", () => {
		render(
			<GameShell accent={{ color: "#e60000", onColor: "light" }}>
				<p>content</p>
			</GameShell>,
		);
		const main = screen.getByRole("main");
		expect(main.style.getPropertyValue("--art-accent")).toBe("#e60000");
		expect(main.style.getPropertyValue("--art-on-accent")).toBe("#ffffff");
	});

	it("uses dark text on a bright accent", () => {
		render(
			<GameShell accent={{ color: "#e6e600", onColor: "dark" }}>
				<p>content</p>
			</GameShell>,
		);
		expect(
			screen.getByRole("main").style.getPropertyValue("--art-on-accent"),
		).toBe("#000000");
	});

	it("sets no accent variables without an accent", () => {
		render(
			<GameShell>
				<p>content</p>
			</GameShell>,
		);
		const main = screen.getByRole("main");
		expect(main.style.getPropertyValue("--art-accent")).toBe("");
		expect(main.style.getPropertyValue("--art-on-accent")).toBe("");
	});
});
